from app.parser import parse_code


code = """
const express = require("express");

function hello(name) {
    return "Hello " + name;
}

function add(a, b) {
    return a + b;
}

class UserService {
    getUser(id) {
        return id;
    }
}
"""


tree = parse_code(code, "javascript")

root = tree.root_node

print("Root type:", root.type)
print("Number of children:", len(root.named_children))

for child in root.named_children:
    print(
        "Type:",
        child.type,
        "| Start:",
        child.start_point,
        "| End:",
        child.end_point
    )