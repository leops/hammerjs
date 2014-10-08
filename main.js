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
	stats = new Stats();

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
				geometry.vertices[index].setZ((z * row[y]) + elevation);
		}
	}

	mesh.quaternion.copy(quaternion);
	mesh.position.copy(displacement.box.center());
	scene.add(mesh);

    return mesh;
}

function planeIntersection(tri1, tri2, tri3) {
	var normals = [tri1.normal(), tri2.normal(), tri3.normal()],
		nMat = new THREE.Matrix3(
			normals[0].x, normals[1].x, normals[2].x,
			normals[0].y, normals[1].y, normals[2].y,
			normals[0].z, normals[1].z, normals[2].z
		),
		determinant = nMat.determinant();

	if(determinant)
		return normals[1].clone().cross(
			normals[2]).multiplyScalar(tri1.a.dot(normals[0])
		).add(
			normals[2].clone().cross(
				normals[0]).multiplyScalar(tri2.a.dot(normals[1])
			).add(
				normals[0].clone().cross(
					normals[1]).multiplyScalar(tri3.a.dot(normals[2])
				)
			)
		).multiplyScalar(1.0 / determinant);
}

function combinations(set, k) {
	var i, j, combs, head, tailcombs;

	if (k > set.length || k <= 0) {
		return [];
	}

	if (k == set.length) {
		return [set];
	}

	combs = [];

	if (k == 1) {
		for (i = 0; i < set.length; i++) {
			combs.push([set[i]]);
		}
	} else {
		for (i = 0; i < set.length - k + 1; i++) {
			head = set.slice(i, i+1);
			tailcombs = combinations(set.slice(i + 1), k - 1);
			for (j = 0; j < tailcombs.length; j++) {
				combs.push(head.concat(tailcombs[j]));
			}
		}
	}

	return combs;
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

function triangulate(face) {
    var up = (new THREE.Triangle(face[0], face[1], face[2])).normal(),
        planar;

    if(Math.abs(up.z) != 1) {
        var m = planeMat(up);
        planar = face.map(function(f) {
            var v = f.clone().applyMatrix3(m);
            return [v.x, v.z];
        });
    } else {
        planar = face.map(function(v) {
            return [v.x, v.y];
        });
    }

    return Delaunay.triangulate(planar);
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

		var solids = map.world.solid.map(function(brush) {
			var displacements = [],
				color, mat, mesh;

			if(brush.editor && brush.editor.color) {
				var colors = brush.editor.color.split(' ');
				color = new THREE.Color(colors[0] / 255, colors[1] / 255, colors[2] / 255);
			}

            mat = new THREE.MeshBasicMaterial({
                color: !!color ? color : randomColor(),
                wireframe: true,
                side: THREE.DoubleSide
            });

			var triangles = brush.side.map(function(side, id) {
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
                    displacements[id].face = id;
					displacements[id].tangent = triangle.normal();
				}

				return triangle;
			});

			var indexes = (function(x) {
					var _results = [];
					for (var _i = 0, _ref = x - 1; 0 <= _ref ? _i <= _ref : _i >= _ref; 0 <= _ref ? _i++ : _i--){ _results.push(_i); }
					return _results;
				})(triangles.length),
				combs = combinations(indexes, 3);

			var faces = {};
            combs.forEach(function(comb) {
				var point = planeIntersection(triangles[comb[0]], triangles[comb[1]], triangles[comb[2]]);

                if(point) {
                    comb.forEach(function(f) {
                        if(!faces[f])
                            faces[f] = [];
                        faces[f].push(point);
                    });
                }
			});

			if(displacements.length == 0) {
				var geom = new THREE.Geometry();

				for(var i in faces) {
					try {
                        var face = faces[i],
                            tris = triangulate(face);
                        for(var i = 0; i < tris.length; i += 3) {
                            var id = geom.vertices.push(face[tris[i]], face[tris[i + 1]], face[tris[i + 2]]),
                                normal = (new THREE.Triangle(face[0], face[1], face[2])).normal()
                            geom.faces.push(new THREE.Face3(id - 3, id - 2, id - 1, normal)); // triangles[i].normal()
                        }
                    } catch(e) {
                        console.error(e);
                    }
                }

				mesh = new THREE.Mesh( geom, mat );
				scene.add(mesh);
			} else {
				displacements.forEach(function(displacement) {
                    var face = faces[displacement.face],
                        box = (new THREE.Box3()).setFromPoints(face),
                        m = planeMat(displacement.tangent),
                        min = box.min.clone().applyMatrix3(m),
                        max = box.max.clone().applyMatrix3(m),
                        start = displacement.startposition.split(/[\[\]]/)[0].split(' ');
                    displacement.origin = new THREE.Vector3(start[0], start[1], start[2]);
                    displacement.box = box;
                    displacement.size = max.sub(min);
                    addDisplacement(displacement, mat);
				});
			}

			return mesh;
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
	stats.begin();

	requestAnimationFrame(render);
	controls.update(clock.getDelta());
	renderer.render(scene, camera);

	stats.end();
}
render();
