const n = `{
    "nodes": {
        "node1": {
            "op": "foo",
            "children": [
                "node2",
                "node3"
            ],
            "eclass": "18"
        },
        "node2": {
            "op": "bar",
            "eclass": "12"
        },
        "node3": {
            "op": "baz",
            "children": [],
            "eclass": "12",
            "cost": 6.0
        }
    },
    "class_data": {
        "18": {
            "type": "foobar"
        }
    }
}`;
export {
  n as default
};
