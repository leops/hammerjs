var up = new THREE.Vector3(0, 0, 1),
    scene = new THREE.Scene(),
    width =  window.innerWidth,
    height = window.innerHeight - 4,
    camera = new THREE.PerspectiveCamera( 75, width / height, 0.1, 10000 ),
    controls = new THREE.FirstPersonControls(camera),
    renderer = new THREE.WebGLRenderer(),
    elem = renderer.domElement,
    loading = document.querySelector('.loading'),
    clock = new THREE.Clock();

renderer.setSize( width, height );
document.body.appendChild( elem );

elem.addEventListener('click', function (e) {
    elem.requestPointerLock = elem.requestPointerLock || elem.mozRequestPointerLock || elem.webkitRequestPointerLock;
    elem.requestPointerLock();
}, false);

document.addEventListener('pointerlockchange', function(e) {
    if ( document.pointerLockElement === elem || document.mozPointerLockElement === elem || document.webkitPointerLockElement === elem ) {
        controls.freeze = false;
    } else {
        controls.freeze = true;
    }
}, false );


controls.movementSpeed = 100;
controls.lookSpeed = 10;
controls.freeze = true;
old = controls.update;
controls.update = function() {
    old.apply(controls, arguments);
    this.mouseX = 0;
    this.mouseY = 0;
};
scene.add( camera );

document.addEventListener('mousemove', function(e) {
    if(!controls.freeze) {
        controls.mouseX = e.webkitMovementX;
        controls.mouseY = e.webkitMovementY;
        //console.log(e.webkitMovementX, e.webkitMovementY);
    }
}, false);

function quaternionFromVector(tangent) {
    var axis = (new THREE.Vector3()).crossVectors(up, tangent).normalize(),
        radians = Math.acos(up.dot( tangent ));
    return (new THREE.Quaternion()).setFromAxisAngle(axis, radians);
}

function addDisplacement(displacement, color) {
    var elevation = displacement.elevation,
        quaternion = quaternionFromVector(displacement.tangent),
        size = displacement.box.size().applyQuaternion(quaternion),
        power = Math.pow(2, displacement.power),
        geometry = new THREE.PlaneGeometry(size.x, size.y, power, power),
        material = new THREE.MeshBasicMaterial( {
            color: !!color ? color : randomColor(),
            wireframe: true
        }),
        mesh = new THREE.Mesh( geometry, material );
    for(var x  = 0; x <= power; x++) {
        var row = displacement.distances["row" + x].split(" "),
            normal = displacement.normals["row" + x].split(" ");
        for(var y  = 0; y <= power; y++) {
            var z = normal[(y * 3) + 2],
                index = (y * 17) + x;
            if(geometry.vertices[index])
                geometry.vertices[index].setZ((z * row[y]) + elevation);
        }
    }
    mesh.quaternion.copy(quaternion);
    mesh.position.copy(displacement.box.center());
    scene.add(mesh);
}

elem.ondrop = function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    loading.classList.remove('hidden');

    var files = e.dataTransfer.files,
        reader = new FileReader();
    reader.readAsText(files[0]);
    reader.onloadend = function(e) {
        var map = vmfparser(reader.result);

        map.world.solid.forEach(function(brush) {
            var geometry = new THREE.Geometry(),
                displacements = [],
                color;

            if(brush && brush.editor && brush.editor.color) {
                var colors = brush.editor.color.split(' ');
                color = new THREE.Color(colors[0] / 255, colors[1] / 255, colors[2] / 255);
            }

            brush.side.forEach(function(side) {
                var points = side.plane.split(/[()]/).map(function(point) {
                        if(point.match(/^[\s\t]*$/) === null) {
                            var elem = point.split(" "),
                                vector = new THREE.Vector3(Number(elem[0]), Number(elem[2]), Number(elem[1]));
                            return vector;
                        }
                    }).filter(function(e) {return !!e;}),
                    line = new THREE.Line3(points[0], points[2]),
                    fourth = line.center().multiplyScalar(2).sub(points[1]),
                    id = geometry.vertices.push(points[0], points[1], points[2], fourth);

                geometry.faces.push(
                    new THREE.Face3(id - 4, id - 3, id - 2),
                    new THREE.Face3(id - 2, id - 1, id - 4)
                );

                if(side.dispinfo) {
                    var id = displacements.push(side.dispinfo);
                    displacements[id - 1].tangent = (new THREE.Triangle(points[0], points[1], points[2])).normal();
                    displacements[id - 1].box = (new THREE.Box3()).setFromPoints(points);
                }
            });

            if(displacements.length == 0) {
                var material = new THREE.MeshBasicMaterial( {
                    color: !!color ? color : randomColor(),
                    wireframe: true
                }),
                brush = new THREE.Mesh( geometry, material );
                scene.add(brush);
            } else {
                displacements.forEach(function(displacement) {
                    addDisplacement(displacement, color);
                });
            }
        });

        loading.classList.add('hidden');
    };
};

elem.ondragover = function (e) {
    e.stopPropagation();
    e.preventDefault();
    var dt = e.dataTransfer;

    dt.effectAllowed = dt.dropEffect = 'move';
};

function render() {
    requestAnimationFrame(render);
    controls.update(clock.getDelta());
    renderer.render(scene, camera);
}
render();
