from app.language_profiles import LANGUAGE_PROFILES

def get_symbol_name(node, language, code):
    name_node = node.child_by_field_name("name")

    if name_node is None:
        return None

    return code[name_node.start_byte:name_node.end_byte]
def walk_tree(node, language, code, file_path, chunks):
    node_type = node.type
    allowed_types = LANGUAGE_PROFILES[language]["chunk_nodes"]

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