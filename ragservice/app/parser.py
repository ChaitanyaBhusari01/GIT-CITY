from tree_sitter_language_pack import get_parser


def parse_code(code : str , language : str):
    """
    parse source code using tree-sitter . 
    args : code: Source code as a string.
    language: tree-sitter language name,
     eg: 'javascript',typescript','python'.

     return tree-sitter syntax tree,


    """

    parser = get_parser(language)

    tree = parser.parse(code.encode("utf-8"))

    return tree