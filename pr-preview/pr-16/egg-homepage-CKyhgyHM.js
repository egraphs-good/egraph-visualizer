const n = `[
  {
    "nodes": {
      "primitive-i64-2": {
        "op": "2",
        "children": [],
        "eclass": "i64-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-2"
        ],
        "eclass": "Expr-1",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"a\\"",
        "children": [],
        "eclass": "String-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Var": {
        "op": "Var",
        "children": [
          "primitive-String-0"
        ],
        "eclass": "Expr-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Var",
          "function-0-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Div": {
        "op": "Div",
        "children": [
          "function-0-Mul",
          "function-0-Num"
        ],
        "eclass": "Expr-3",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Expr-1": {
        "type": "Expr"
      },
      "i64-2": {
        "type": "i64"
      },
      "Expr-0": {
        "type": "Expr"
      },
      "String-0": {
        "type": "String"
      },
      "Expr-2": {
        "type": "Expr"
      },
      "Expr-3": {
        "type": "Expr",
        "let": "$e"
      }
    }
  },
  {
    "nodes": {
      "primitive-i64-2": {
        "op": "2",
        "children": [],
        "eclass": "i64-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-2"
        ],
        "eclass": "Expr-1",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-1": {
        "op": "1",
        "children": [],
        "eclass": "i64-1",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-1"
        ],
        "eclass": "Expr-4",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"a\\"",
        "children": [],
        "eclass": "String-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Var": {
        "op": "Var",
        "children": [
          "primitive-String-0"
        ],
        "eclass": "Expr-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Var",
          "function-0-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Var",
          "function-1-Div"
        ],
        "eclass": "Expr-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Div": {
        "op": "Div",
        "children": [
          "function-0-Mul",
          "function-0-Num"
        ],
        "eclass": "Expr-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Div": {
        "op": "Div",
        "children": [
          "function-0-Num",
          "function-0-Num"
        ],
        "eclass": "Expr-5",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Shl": {
        "op": "Shl",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Expr-1": {
        "type": "Expr"
      },
      "i64-2": {
        "type": "i64"
      },
      "Expr-4": {
        "type": "Expr"
      },
      "i64-1": {
        "type": "i64"
      },
      "Expr-0": {
        "type": "Expr"
      },
      "String-0": {
        "type": "String"
      },
      "Expr-2": {
        "type": "Expr"
      },
      "Expr-3": {
        "type": "Expr",
        "let": "$e"
      },
      "Expr-5": {
        "type": "Expr"
      }
    }
  },
  {
    "nodes": {
      "primitive-i64-2": {
        "op": "2",
        "children": [],
        "eclass": "i64-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-2"
        ],
        "eclass": "Expr-1",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-1": {
        "op": "1",
        "children": [],
        "eclass": "i64-1",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-1"
        ],
        "eclass": "Expr-4",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"a\\"",
        "children": [],
        "eclass": "String-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Var": {
        "op": "Var",
        "children": [
          "primitive-String-0"
        ],
        "eclass": "Expr-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Var",
          "function-0-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Expr-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Div": {
        "op": "Div",
        "children": [
          "function-0-Mul",
          "function-0-Num"
        ],
        "eclass": "Expr-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Div": {
        "op": "Div",
        "children": [
          "function-0-Num",
          "function-0-Num"
        ],
        "eclass": "Expr-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Shl": {
        "op": "Shl",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Expr-1": {
        "type": "Expr"
      },
      "i64-2": {
        "type": "i64"
      },
      "Expr-4": {
        "type": "Expr"
      },
      "i64-1": {
        "type": "i64"
      },
      "Expr-0": {
        "type": "Expr"
      },
      "String-0": {
        "type": "String"
      },
      "Expr-2": {
        "type": "Expr"
      },
      "Expr-3": {
        "type": "Expr",
        "let": "$e"
      }
    }
  },
  {
    "nodes": {
      "primitive-i64-2": {
        "op": "2",
        "children": [],
        "eclass": "i64-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-2"
        ],
        "eclass": "Expr-1",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-1": {
        "op": "1",
        "children": [],
        "eclass": "i64-1",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-1"
        ],
        "eclass": "Expr-4",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"a\\"",
        "children": [],
        "eclass": "String-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Var": {
        "op": "Var",
        "children": [
          "primitive-String-0"
        ],
        "eclass": "Expr-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-1-Div",
          "function-0-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Mul": {
        "op": "Mul",
        "children": [
          "function-1-Mul",
          "function-1-Num"
        ],
        "eclass": "Expr-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Div": {
        "op": "Div",
        "children": [
          "function-0-Num",
          "function-0-Num"
        ],
        "eclass": "Expr-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Div": {
        "op": "Div",
        "children": [
          "function-0-Mul",
          "function-0-Num"
        ],
        "eclass": "Expr-0",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Shl": {
        "op": "Shl",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Expr-2",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Expr-1": {
        "type": "Expr"
      },
      "i64-2": {
        "type": "i64"
      },
      "Expr-4": {
        "type": "Expr"
      },
      "i64-1": {
        "type": "i64"
      },
      "Expr-0": {
        "type": "Expr",
        "let": "$e"
      },
      "String-0": {
        "type": "String"
      },
      "Expr-2": {
        "type": "Expr"
      }
    }
  }
]
`;
export {
  n as default
};
