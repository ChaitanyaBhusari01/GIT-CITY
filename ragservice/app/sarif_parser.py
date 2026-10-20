"""Robust extraction of findings from SARIF security reports."""

from __future__ import annotations

from typing import Any
from urllib.parse import unquote


def _message_text(value: Any) -> str | None:
    """Extract readable text from a SARIF message object."""
    if isinstance(value, str):
        return value

    if isinstance(value, dict):
        return value.get("text") or value.get("markdown")

    return None


def _normalize_uri(uri: Any) -> str | None:
    """Normalize a repository-style SARIF artifact URI."""
    if not isinstance(uri, str) or not uri:
        return None

    path = unquote(uri).replace("\\", "/")

    while path.startswith("./"):
        path = path[2:]

    return path


def _location_info(location: Any) -> dict[str, Any]:
    """Convert a SARIF location to a convenient structured representation."""
    if not isinstance(location, dict):
        location = {}

    physical = location.get("physicalLocation") or {}
    artifact = physical.get("artifactLocation") or {}
    region = physical.get("region") or {}

    uri = artifact.get("uri")

    return {
        "file_path": _normalize_uri(uri),
        "artifact_uri": uri,
        "uri_base_id": artifact.get("uriBaseId"),
        "start_line": region.get("startLine"),
        "end_line": region.get("endLine"),
        "start_column": region.get("startColumn"),
        "end_column": region.get("endColumn"),
        "message": _message_text(location.get("message")),
        "raw_location": location,
    }


def _resolve_rule_descriptor(
    run: dict[str, Any],
    result: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Resolve a result's rule reference against its tool component."""
    tool = run.get("tool") or {}
    driver = tool.get("driver") or {}
    extensions = tool.get("extensions") or []

    rule_ref = result.get("rule") or {}
    rule_id = result.get("ruleId") or rule_ref.get("id")
    rule_index = rule_ref.get("index")
    component_ref = rule_ref.get("toolComponent") or {}

    preferred_components: list[dict[str, Any]] = []

    component_index = component_ref.get("index")
    if (
        isinstance(component_index, int)
        and not isinstance(component_index, bool)
        and 0 <= component_index < len(extensions)
    ):
        preferred_components.append(extensions[component_index])

    # If the direct reference cannot be resolved, fall back to searching
    # the driver and extensions by rule ID.
    components = preferred_components + [driver] + extensions

    seen: set[int] = set()

    for component in components:
        if id(component) in seen:
            continue
        seen.add(id(component))

        rules = component.get("rules") or []

        if (
            isinstance(rule_index, int)
            and not isinstance(rule_index, bool)
            and 0 <= rule_index < len(rules)
        ):
            candidate = rules[rule_index]

            if not rule_id or candidate.get("id") == rule_id:
                return candidate, component

        if rule_id:
            for candidate in rules:
                if candidate.get("id") == rule_id:
                    return candidate, component

    return {}, {}


def _extract_code_flow_steps(
    code_flows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Flatten thread-flow locations while retaining their order and indices."""
    steps: list[dict[str, Any]] = []

    for flow_index, flow in enumerate(code_flows, start=1):
        thread_flows = flow.get("threadFlows") or []

        for thread_index, thread_flow in enumerate(thread_flows, start=1):
            locations = thread_flow.get("locations") or []

            for step_index, step in enumerate(locations, start=1):
                location = _location_info(step.get("location") or {})

                steps.append({
                    "flow_index": flow_index,
                    "thread_flow_index": thread_index,
                    "step_index": step_index,
                    **location,
                })

    return steps


def parse_sarif(sarif_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse SARIF results without discarding useful security evidence."""
    findings: list[dict[str, Any]] = []

    for run in sarif_data.get("runs") or []:
        tool = run.get("tool") or {}
        driver = tool.get("driver") or {}

        for result in run.get("results") or []:
            descriptor, component = _resolve_rule_descriptor(run, result)

            rule_properties = descriptor.get("properties") or {}
            default_configuration = (
                descriptor.get("defaultConfiguration") or {}
            )

            # Preserve the reported result level separately from the
            # resolved level so we never imply SARIF explicitly supplied it.
            result_level = result.get("level")
            default_level = default_configuration.get("level")
            problem_severity = rule_properties.get("problem.severity")

            if result_level is not None:
                effective_level = result_level
                severity_source = "result.level"
            elif default_level is not None:
                effective_level = default_level
                severity_source = "rule.defaultConfiguration.level"
            elif problem_severity is not None:
                effective_level = problem_severity
                severity_source = "rule.properties.problem.severity"
            else:
                effective_level = None
                severity_source = None

            security_severity_raw = rule_properties.get("security-severity")

            try:
                security_severity = (
                    float(security_severity_raw)
                    if security_severity_raw is not None
                    else None
                )
            except (TypeError, ValueError):
                security_severity = None

            raw_locations = result.get("locations") or []
            primary = (
                _location_info(raw_locations[0])
                if raw_locations
                else None
            )

            raw_message = result.get("message") or {}
            code_flows = result.get("codeFlows") or []
            related_locations = result.get("relatedLocations") or []

            rule_id = result.get("ruleId") or descriptor.get("id")
            rule_properties_tags = rule_properties.get("tags") or []

            rule_metadata = {
                "id": descriptor.get("id") or rule_id,
                "name": descriptor.get("name"),
                "short_description": _message_text(
                    descriptor.get("shortDescription")
                ),
                "full_description": _message_text(
                    descriptor.get("fullDescription")
                ),
                "help_uri": descriptor.get("helpUri"),
                "default_configuration": default_configuration,
                "properties": rule_properties,
                "tags": rule_properties_tags,
                "component_name": component.get("name"),
                "rule_index": (result.get("rule") or {}).get("index"),
            }

            findings.append({
                # Existing fields retained for current callers.
                "rule_id": rule_id,
                "level": effective_level,
                "message": _message_text(raw_message),
                "file_path": (
                    primary["file_path"] if primary else None
                ),
                "start_line": (
                    primary["start_line"] if primary else None
                ),
                "end_line": (
                    primary["end_line"] if primary else None
                ),
                "locations": raw_locations,
                "related_locations": related_locations,
                "code_flows": code_flows,

                # Additional normalized evidence.
                "result_level": result_level,
                "severity_source": severity_source,
                "security_severity": security_severity,
                "security_severity_raw": security_severity_raw,
                "rule_metadata": rule_metadata,
                "primary_location": primary,
                "normalized_related_locations": [
                    _location_info(location)
                    for location in related_locations
                ],
                "code_flow_steps": _extract_code_flow_steps(code_flows),
                "message_markdown": (
                    raw_message.get("markdown")
                    if isinstance(raw_message, dict)
                    else None
                ),
                "fingerprints": result.get("fingerprints") or {},
                "partial_fingerprints": (
                    result.get("partialFingerprints") or {}
                ),
                "baseline_state": result.get("baselineState"),
                "suppressions": result.get("suppressions") or [],
                "result_properties": result.get("properties") or {},
                "rule_reference": result.get("rule"),
                "tool_name": driver.get("name"),
                "tool_version": (
                    driver.get("semanticVersion") or driver.get("version")
                ),
                "raw_result": result,
            })

    return findings