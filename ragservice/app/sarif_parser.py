def parse_sarif(sarif_data: dict) -> list[dict]:
    findings = []

    for run in sarif_data.get("runs",[]):
        for result in run.get("results",[]):

            location = result.get("locations", [])[0]

            physical_location = location.get("physicalLocation", {})

            artifact_location = physical_location.get("artifactLocation", {})

            region = physical_location.get("region", {})

            finding = {
                "rule_id": result.get("ruleId"),
                "level": result.get("level"),
                "message": result.get("message", {}).get("text"),
                "file_path": artifact_location.get("uri"),
                "start_line": region.get("startLine"),
                "end_line": region.get("endLine"),
                "locations": result.get("locations", []),
                "related_locations": result.get("relatedLocations", []),
                "code_flows": result.get("codeFlows", []),
            }

            findings.append(finding)

    return findings