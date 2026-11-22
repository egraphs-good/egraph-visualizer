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
        "eclass": "Math-0",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-3": {
        "op": "3",
        "children": [],
        "eclass": "i64-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-3"
        ],
        "eclass": "Math-2",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-6": {
        "op": "6",
        "children": [],
        "eclass": "i64-6",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-6"
        ],
        "eclass": "Math-5",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"x\\"",
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
        "eclass": "Math-1",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Add": {
        "op": "Add",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Math-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Add": {
        "op": "Add",
        "children": [
          "function-2-Num",
          "function-1-Mul"
        ],
        "eclass": "Math-7",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-0-Add"
        ],
        "eclass": "Math-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-0-Var"
        ],
        "eclass": "Math-6",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Math-0": {
        "type": "Math"
      },
      "i64-2": {
        "type": "i64"
      },
      "Math-2": {
        "type": "Math"
      },
      "i64-3": {
        "type": "i64"
      },
      "Math-5": {
        "type": "Math"
      },
      "i64-6": {
        "type": "i64"
      },
      "Math-1": {
        "type": "Math"
      },
      "String-0": {
        "type": "String"
      },
      "Math-3": {
        "type": "Math"
      },
      "Math-7": {
        "type": "Math",
        "let": "$expr2"
      },
      "Math-6": {
        "type": "Math"
      },
      "Math-4": {
        "type": "Math",
        "let": "$expr1"
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
        "eclass": "Math-0",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-3": {
        "op": "3",
        "children": [],
        "eclass": "i64-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-3"
        ],
        "eclass": "Math-2",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-6": {
        "op": "6",
        "children": [],
        "eclass": "i64-6",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-6"
        ],
        "eclass": "Math-5",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"x\\"",
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
        "eclass": "Math-1",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Add": {
        "op": "Add",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Math-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Add": {
        "op": "Add",
        "children": [
          "function-2-Num",
          "function-1-Mul"
        ],
        "eclass": "Math-7",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Add": {
        "op": "Add",
        "children": [
          "function-1-Num",
          "function-0-Var"
        ],
        "eclass": "Math-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-3-Add": {
        "op": "Add",
        "children": [
          "function-1-Mul",
          "function-2-Num"
        ],
        "eclass": "Math-7",
        "cost": 1.0,
        "subsumed": false
      },
      "function-4-Add": {
        "op": "Add",
        "children": [
          "function-1-Mul",
          "function-2-Mul"
        ],
        "eclass": "Math-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-2-Add"
        ],
        "eclass": "Math-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-0-Var"
        ],
        "eclass": "Math-6",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-1-Num"
        ],
        "eclass": "Math-8",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Math-0": {
        "type": "Math"
      },
      "i64-2": {
        "type": "i64"
      },
      "Math-2": {
        "type": "Math"
      },
      "i64-3": {
        "type": "i64"
      },
      "Math-5": {
        "type": "Math"
      },
      "i64-6": {
        "type": "i64"
      },
      "Math-1": {
        "type": "Math"
      },
      "String-0": {
        "type": "String"
      },
      "Math-3": {
        "type": "Math"
      },
      "Math-7": {
        "type": "Math",
        "let": "$expr2"
      },
      "Math-6": {
        "type": "Math"
      },
      "Math-4": {
        "type": "Math",
        "let": "$expr1"
      },
      "Math-8": {
        "type": "Math"
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
        "eclass": "Math-0",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-3": {
        "op": "3",
        "children": [],
        "eclass": "i64-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-3"
        ],
        "eclass": "Math-2",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-i64-6": {
        "op": "6",
        "children": [],
        "eclass": "i64-6",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Num": {
        "op": "Num",
        "children": [
          "primitive-i64-6"
        ],
        "eclass": "Math-5",
        "cost": 1.0,
        "subsumed": false
      },
      "primitive-String-0": {
        "op": "\\"x\\"",
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
        "eclass": "Math-1",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Add": {
        "op": "Add",
        "children": [
          "function-0-Var",
          "function-1-Num"
        ],
        "eclass": "Math-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Add": {
        "op": "Add",
        "children": [
          "function-1-Num",
          "function-0-Var"
        ],
        "eclass": "Math-3",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Add": {
        "op": "Add",
        "children": [
          "function-1-Mul",
          "function-2-Num"
        ],
        "eclass": "Math-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-3-Add": {
        "op": "Add",
        "children": [
          "function-2-Mul",
          "function-1-Mul"
        ],
        "eclass": "Math-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-0-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-1-Add"
        ],
        "eclass": "Math-4",
        "cost": 1.0,
        "subsumed": false
      },
      "function-1-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-0-Var"
        ],
        "eclass": "Math-6",
        "cost": 1.0,
        "subsumed": false
      },
      "function-2-Mul": {
        "op": "Mul",
        "children": [
          "function-0-Num",
          "function-1-Num"
        ],
        "eclass": "Math-5",
        "cost": 1.0,
        "subsumed": false
      }
    },
    "root_eclasses": [],
    "class_data": {
      "Math-0": {
        "type": "Math"
      },
      "i64-2": {
        "type": "i64"
      },
      "Math-2": {
        "type": "Math"
      },
      "i64-3": {
        "type": "i64"
      },
      "Math-5": {
        "type": "Math"
      },
      "i64-6": {
        "type": "i64"
      },
      "Math-1": {
        "type": "Math"
      },
      "String-0": {
        "type": "String"
      },
      "Math-3": {
        "type": "Math"
      },
      "Math-4": {
        "type": "Math",
        "let": "$expr1, $expr2"
      },
      "Math-6": {
        "type": "Math"
      }
    }
  }
]
`;
export {
  n as default
};
