var up = new THREE.Vector3(0, 0, 1),
	scene = new THREE.Scene(),
	width =  window.innerWidth,
	height = window.innerHeight - 4,
	camera = new THREE.PerspectiveCamera( 75, width / height, 0.1, 10000 ),
	controls = new THREE.FirstPersonControls(camera),
	renderer = new THREE.WebGLRenderer(),
	elem = renderer.domElement,
	loading = document.querySelector('.loading'),
	clock = new THREE.Clock(),
	stats = new Stats(),
	solids = [];

renderer.setSize( width, height );
document.body.appendChild( elem );

elem.addEventListener('click', function (e) {
	elem.requestPointerLock = elem.requestPointerLock || elem.mozRequestPointerLock || elem.webkitRequestPointerLock;
	elem.requestPointerLock();
}, false);

document.addEventListener('pointerlockchange', function(e) {
	if ( document.pointerLockElement === elem || document.mozPointerLockElement === elem || document.webkitPointerLockElement === elem ) {
		controls.enabled = true;
	} else {
		controls.enabled = false;
	}
}, false );

camera.up.set(0, -1, 0);
controls.movementSpeed = 250;
controls.lookSpeed = -10;
controls.enabled = false;
old = controls.update;
controls.update = function() {
	old.apply(controls, arguments);
	this.mouseX = 0;
	this.mouseY = 0;
};
scene.add( camera );

stats.setMode(0);
stats.domElement.style.position = 'absolute';
stats.domElement.style.left = '0px';
stats.domElement.style.top = '0px';
document.body.appendChild( stats.domElement );

document.addEventListener('mousemove', function(e) {
	if(!controls.freeze) {
		controls.mouseX = e.webkitMovementX;
		controls.mouseY = e.webkitMovementY;
	}
}, false);

function quaternionFromVector(up, tangent) {
	var axis = up.clone().cross(tangent).normalize(),
		radians = Math.acos(up.dot(tangent));
	return (new THREE.Quaternion()).setFromAxisAngle(axis, radians);
}

function addDisplacement(displacement, material) {
	var elevation = displacement.elevation,
		quaternion = quaternionFromVector(up, displacement.tangent),
		size = displacement.size.applyQuaternion(quaternion),
		power = Math.pow(2, displacement.power),
		geometry = new THREE.PlaneGeometry(size.x, size.y, power, power),
		mesh = new THREE.Mesh( geometry, material );

	for(var x  = 0; x <= power; x++) {
		var row = displacement.distances["row" + x].split(" "),
			normal = displacement.normals["row" + x].split(" ");
		for(var y  = 0; y <= power; y++) {
			var z = normal[(y * 3) + 2],
				index = (y * 17) + x;
			if(geometry.vertices[index])
				geometry.vertices[index].setZ(-((z * row[y]) + elevation));
		}
	}

	mesh.quaternion.copy(quaternion);
	mesh.position.copy(displacement.box.center());
	scene.add(mesh);

    return mesh;
}

function planeMat(up) {
    var right;
    if (Math.abs(up.x) > Math.abs(up.z))
        right = up.clone().cross(new THREE.Vector3(0, 0, 1));
    else
        right = up.clone().cross(new THREE.Vector3(1, 0, 0));

    right.normalize();
    var backward = right.clone().cross(up);

    return m = new THREE.Matrix3(
        right.x, up.x, backward.x,
        right.y, up.y, backward.y,
        right.z, up.z, backward.z
    );
}

// BUG: Using face.map seems to double the final array's length
function fixLength (a) {
	var b = [];
	a.forEach(function(e, i) {
		b[i] = e;
	});
	return b;
}

function triangulate(face) {
    var Delaunay = require('./delaunay'),
		up = (new THREE.Triangle(face[0], face[1], face[2])).normal(),
        planar;

    if(Math.abs(up.z) != 1) {
        var m = planeMat(up);
        planar = face.map(function(f, i) {
            var v = f.clone().applyMatrix3(m);
            return [v.x, v.z];
        });
    } else {
        planar = face.map(function(v, i) {
            return [v.x, v.y];
        });
    }

    return Delaunay.triangulate(fixLength(planar));
}

function openFile(content) {
	var vmfparser = require('./parser'),
		map = vmfparser(content);

	solids = map.world.solid.map(function(brush) {
		var displacements = [],
			color, mat, mesh;

		if(brush.editor && brush.editor.color) {
			var colors = brush.editor.color.split(' ');
			color = new THREE.Color(colors[0] / 255, colors[1] / 255, colors[2] / 255);
		}

        mat = new THREE.MeshBasicMaterial({
            color: !!color ? color : randomColor(),
            wireframe: false,
            side: THREE.DoubleSide
        });

		var planes = brush.side.map(function(side, index) {
			var points = side.plane.split(/[()]/).map(function(point) {
					if(point.match(/^[\s\t]*$/) === null) {
						var elem = point.split(" "),
							vector = new THREE.Vector3(Number(elem[0]), Number(elem[2]), Number(elem[1]));
						return vector;
					}
				}).filter(function(e) {return !!e;}),
				triangle = new THREE.Triangle(points[0], points[1], points[2]);

			if(side.dispinfo) {
				var id = displacements.push(side.dispinfo) - 1;
                displacements[id].face = index;
				displacements[id].tangent = triangle.normal();
			}

			return triangle.plane();
		});

		var polylib = require('./polylib');
		var faces = planes.map(function(base, i) {
			var winding = polylib.BaseWindingForPlane(base);
			planes.forEach(function(clip, j) {
				if(i != j) {
					winding = polylib.ChopWinding(winding, clip);
				}
			});
			return fixLength(winding.p);
		});

		if(displacements.length == 0) {
			var geom = new THREE.Geometry();

			faces.forEach(function(face, index) {
				try {
                    var tris = triangulate(face);
                    for(var i = 0; i < tris.length; i += 3) {
                        var id = geom.vertices.push(face[tris[i]], face[tris[i + 1]], face[tris[i + 2]]),
                            normal = (new THREE.Triangle(face[0], face[1], face[2])).normal()
                        geom.faces.push(new THREE.Face3(id - 3, id - 2, id - 1, normal));
                    }
                } catch(e) {
                    console.error(e, index, face);
                }
            });

			mesh = new THREE.Mesh( geom, mat );
			scene.add(mesh);

			return mesh;
		} else {
			return displacements.map(function(displacement) {
				try {
					var face = faces[displacement.face],
	                    box = (new THREE.Box3()).setFromPoints(face),
	                    m = planeMat(displacement.tangent),
	                    min = box.min.clone().applyMatrix3(m),
	                    max = box.max.clone().applyMatrix3(m),
	                    start = displacement.startposition.split(/[\[\]]/)[0].split(' ');
					displacement.origin = new THREE.Vector3(start[0], start[1], start[2]);
	                displacement.box = box;
	                displacement.size = max.sub(min);
	                return addDisplacement(displacement, mat);
				} catch(e) {
					console.error(e, face);
				}
			});
		}
	});

	loading.classList.add('hidden');
}

function setWireframe(w) {
	scene.children.forEach(function(m) {
		if(m.material)
			m.material.wireframe = w;
	})
}

function setupUI() {
	var gui = require('nw.gui'),
		win = gui.Window.get(),
		menubar = new gui.Menu({ type: 'menubar' }),
		file = new gui.Menu(),
		view = new gui.Menu();

	file.append(new gui.MenuItem({
		label: 'Open',
		click: function() {
			var chooser = document.querySelector('#fileDialog');
			chooser.addEventListener("change", function(evt) {
				var fs = require('fs');
				loading.classList.remove('hidden');
				fs.readFile(this.value, function(err, data) {
					if(err) return console.error(err);
					openFile(data.toString());
				});
			}, false);
			chooser.click();
		}
	}));

	var isW = false;
	view.append(new gui.MenuItem({
		label: 'Toggle Wireframe',
		click: function() {
			if(isW)
				isW = false;
			else
				isW = true;
			setWireframe(isW);
		}
	}));

	menubar.append(new gui.MenuItem({ label: 'File', submenu: file}));
	menubar.append(new gui.MenuItem({ label: 'View', submenu: view}));
	win.menu = menubar;
}

function render() {
	stats.begin();

	requestAnimationFrame(render);
	controls.update(clock.getDelta());
	renderer.render(scene, camera);

	stats.end();
}
setupUI();
render();
