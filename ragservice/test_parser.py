from app.parser import parse_code
from app.chunker import walk_tree
from app.chunker import chunk_code

code = """
def hello(name):
    return "Hello " + name

def add(a, b):
    return a + b

class UserService:
    def get_user(self, user_id):
        return user_id
"""


tree = parse_code(code, "python")

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

def print_tree(node, indent=0):
    print(" " * indent + node.type)

    for child in node.children:
        print_tree(child,indent + 2)

print_tree(root)

chunks = chunk_code(
    tree,
    code,
    "src/test.js",
    "javascript"
)

print("\nCHUNKS:")
for chunk in chunks:
    print(chunk)