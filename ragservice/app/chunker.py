

    

CHUNK_NODE_TYPES = {
    "javascript": {
        "function_declaration",
        "class_declaration",
        "method_definition",
    },

    "typescript": {

    },

    "java": {

    },

    "c": {

    },

    "cpp": {

    },

    "python": {
        "function_definition",
        "class_definition",
    },
}

def get_symbol_name(node,language,code):
    if language == "javascript":
        name_node = node.named_children[0]   # the first child
        name = code[name_node.start_byte:name_node.end_byte]
        return name

    if language == "python":
        name_node = node.named_children[0]
        name = code[name_node.start_byte:name_node.end_byt]
        return name

def walk_tree(node, language, code, file_path, chunks):
    node_type = node.type
    allowed_types = CHUNK_NODE_TYPES[language]

    if node_type in allowed_types:
        source = code[node.start_byte : node.end_byte] #tree-sitter gives codes byte positions start adn end(this is actual code)
        start_line = node.start_point.row + 1   #its to get the line number (tree - sitter assumes or index it from 0 , so thats why +1)
        end_line = node.end_point.row + 1
        name = get_symbol_name(node,language,code)

        chunk = {                           #creating a chunk
            "file_path": file_path,
            "language": language,
            "type": node_type,
            "name": name,
            "code": source,
            "start_line": start_line,
            "end_line": end_line,
        }

        chunks.append(chunk)

    for child in node.named_children:
        walk_tree(child, language, code, file_path, chunks)

    

def chunk_code(tree,code,file_path,language):
    root = tree.root_node
    chunks = []

    walk_tree(root,language,code,file_path,chunks)
    
    return chunks