LANGUAGE_PROFILES = {
    "javascript": {
        "chunk_nodes": {
            "function_declaration",
            "class_declaration",
            "method_definition",
        },
        "symbol_nodes": {
            "function_declaration",
            "class_declaration",
            "method_definition",
        },
        "construct_nodes": {
            "call_expression",
        },
    },

    "python": {
        "chunk_nodes": {
            "function_definition",
            "class_definition",
        },
        "symbol_nodes": {
            "function_definition",
            "class_definition",
        },
        "construct_nodes": {
            "call",
        },
    },
}