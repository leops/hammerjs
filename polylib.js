var THREE = require('three'),
    ON_EPSILON = 0.1,
    SIDE_FRONT= 0,
    SIDE_BACK = 1,
    SIDE_ON = 2,
    MAX_COORD_INTEGER = 16384;

exports.ChopWinding = function (input, plane, back) {
    var i, j, f, b, dot, maxpts,
        dists = {},
        sides = {},
        counts = [0, 0, 0],
        mid = new THREE.Vector3(0, 0, 0);

    if(typeof back !== "boolean")
        back = false;

    for (i=0; i < input.numpoints; i++) {
        dot = input.p[i].dot(plane.normal);
        dot -= plane.constant;
        dists[i] = dot;

        if (dot > ON_EPSILON)
            sides[i] = SIDE_FRONT;
        else if (dot < -ON_EPSILON)
            sides[i] = SIDE_BACK;
        else
            sides[i] = SIDE_ON;

        counts[sides[i]]++;
    }

    sides[i] = sides[0];
    dists[i] = dists[0];

    if (!counts[0] || !counts[1])
        return input;

    maxpts = input.numpoints + 4;
    f = {
        numpoints: 0,
        p: new Array(maxpts)
    };
    b = {
        numpoints: 0,
        p: new Array(maxpts)
    };

    for (i = 0; i < input.numpoints; i++) {
        var p1 = input.p[i];
        if (sides[i] == SIDE_ON) {
            f.p[f.numpoints] = p1.clone();
            f.numpoints++;
            b.p[b.numpoints] = p1.clone();
            b.numpoints++;
            continue;
        }

        if (sides[i] == SIDE_FRONT) {
            f.p[f.numpoints] = p1.clone();
            f.numpoints++;
        }

        if (sides[i] == SIDE_BACK) {
            b.p[b.numpoints] = p1.clone();
            b.numpoints++;
        }

        if (sides[i+1] == SIDE_ON || sides[i+1] == sides[i])
            continue;

        var p2 = input.p[(i + 1) % input.numpoints];
        dot = dists[i] / (dists[i]-dists[i+1]);

        for (j=0 ; j<3 ; j++) {
            if (plane.normal.getComponent(j) == 1)
                mid.setComponent(j, plane.constant);
            else if (plane.normal.getComponent(j) == -1)
                mid.setComponent(j, -plane.constant);
            else
                mid.setComponent(j, p1.getComponent(j) + dot * (p2.getComponent(j)-p1.getComponent(j)));
        }

        f.p[f.numpoints] = mid.clone();
        f.numpoints++;
        b.p[b.numpoints] = mid.clone();
        b.numpoints++;
    }

    if (f.numpoints > maxpts || b.numpoints > maxpts)
        throw new Error ("ClipWinding: points exceeded estimate");

    if(back)
        return b;
    else
        return f;
};

exports.BaseWindingForPlane = function (plane) {
    var i, v, org, w,
    x = -1,
    max = -1,
    vright = new THREE.Vector3(0, 0, 0),
    vup = new THREE.Vector3(0, 0, 0);

    for (i=0 ; i<3; i++) {
        v = Math.abs(plane.normal.getComponent(i));
        if (v > max) {
            x = i;
            max = v;
        }
    }

    if (x == -1)
        throw new Error ("BaseWindingForPlane: no axis found");

    switch (x) {
        case 0:
        case 1:
            vup.setComponent(2, 1);
            break;
        case 2:
            vup.setComponent(0, 1);
            break;
    }

    v = vup.clone().dot(plane.normal);
    vup.add(plane.normal.clone().multiplyScalar(-v));
    vup.normalize();
    org = plane.normal.clone().multiplyScalar(plane.constant);

    vright.crossVectors(vup, plane.normal);

    vup.multiplyScalar(MAX_COORD_INTEGER * 4);
    vright.multiplyScalar(MAX_COORD_INTEGER * 4);

    w = {
        numpoints: 4,
        p: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0)
        ]
    };

    w.p[0].subVectors(org, vright);
    w.p[0].add(vup);

    w.p[1].addVectors(org, vright);
    w.p[1].add(vup);

    w.p[2].addVectors(org, vright);
    w.p[2].sub(vup);

    w.p[3].subVectors(org, vright);
    w.p[3].sub(vup);

    return w;
};
