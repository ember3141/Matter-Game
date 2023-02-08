/*DO NOT TOUCH*/
const abs = Math.abs; //screw you
function lerp(a, b, t) { //this is the holy math shrine
    return (a + (b - a) * t);
}
function distTwoPoints(xOne,yOne,xTwo,yTwo){
  return Math.sqrt(Math.pow(xTwo-xOne,2)+Math.pow(yTwo-yOne,2))
}
/*DO NOT TOUCH*/
var game = {
    cycle: 0,
    width: 1200,
    height: 800,
    spawn: {
        x: 0,
        y: 0
    },
    fullLife: 100
}
// module aliases
var Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Body = Matter.Body,
    Events = Matter.Events,
    Bounds = Matter.Bounds,
    Constraint = Matter.Constraint,
    Composite = Matter.Composite;
var lastCameraPosx,
    lastCameraPosy,
    changeX,
    changeY,
    xDist,
    yDist,
    mvX,
    mvY,
    objectStroke = 3;
// create an engine
var engine = Engine.create();
var myCanvas = document.getElementById("matterCanvas");
var render = Render.create({
    canvas: myCanvas,
    engine: engine,
    options: {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: 1,
        background: 'rgba(100, 100, 100, 1)',
        wireframeBackground: '#222',
        enabled: true,
        wireframes: false,
        showVelocity: false,
        showAngleIndicator: false,
        showCollisions: false,
    }
});
const CATEGORY_COLLIDABLE = 0b0001 //everything that is 'physical'
const CATEGORY_PLAYER = 0b0010 // the player duh
const CATEGORY_OBJECTS = 0b0100 //things that sensors should see
const CATEGORY_SENSOR = 0b1000 //all sensors
const CATEGORY_GROUND = 0b1011 //my sad attempt at being cool
const playerRadius = 25
//this sensor check if the player is on the ground to enable jumping
var playerJumpSensor = Bodies.rectangle(0, 0, playerRadius, 5, {
    isSensor: true,
    render: {
        visible: false
    },
    //isStatic: true,
});
//radial sensor around the player
var radial = Bodies.circle(0, 0, playerRadius + 40, {
    isSensor: true,
    render: {
        visible: false,
        strokeStyle: 'white',
        fillStyle: '#FF0000',
    },
    isStatic: true,
});
//player
var player = Bodies.circle(300, game.height - 300, playerRadius, {
    density: 0.001,
    friction: 0.7,
    frictionStatic: 0,
    frictionAir: 0.005,
    restitution: 0.3,
    grounded: false,
    life: game.fullLife,
    jumpCD: 0,
    render: {
        strokeStyle: 'black',
        fillStyle: 'lightGrey',
        lineWidth: objectStroke,
        text: {
            content: "",
            color: "black",
            family: "Courier New"
        }
    },
});
//camera object
var camera = Bodies.circle(200, game.height - 300, 1, {
    showVelocity: false,
    collisionFilter: {
        'group': -1,
        'category': 2,
        'mask': 0,
    },
    render: {
        visible: false
    }
});
var throwIndicator = Bodies.polygon(0,0,3,10,{
  showVelocity: true,
  inertia: Infinity,
  render: {
      visible: true,
      fillStyle: "orange"
  }
})
camera.collisionFilter.group = -1
playerJumpSensor.collisionFilter.category = CATEGORY_SENSOR
playerJumpSensor.collisionFilter.group = CATEGORY_OBJECTS | CATEGORY_GROUND
radial.collisionFilter.category = CATEGORY_SENSOR
radial.collisionFilter.mask = CATEGORY_OBJECTS
player.collisionFilter.category = CATEGORY_PLAYER
player.collisionFilter.mask = CATEGORY_COLLIDABLE
throwIndicator.collisionFilter.category = CATEGORY_SENSOR
throwIndicator.collisionFilter.mask = 02;
Composite.add(engine.world, [
    camera,
    radial,
    playerJumpSensor,
    player,
    throwIndicator
]);
// run the renderer
Render.run(render);
// create runner
var runner = Runner.create();
// run the engine
Runner.run(runner, engine);
var power = false,
    touched = [],
    tooMuchNine = false,
    weJustHadPower = false;
var keys = []; //looks for key presses and logs them
document.body.addEventListener("keydown", function(e) {
  tooMuchNine=false;
    if (e.keyCode === 88 && touched.length > 0 && power==false) {
        power = true;
      tooMuchNine = true;
    }
    if (e.keyCode === 88 && power==true && tooMuchNine == false) {
      power = false;
  }
    keys[e.keyCode] = true;
});
document.body.addEventListener("keyup", function(e) {
    keys[e.keyCode] = false;
});
//collision loops
Events.on(engine, "collisionStart", function(event) {
    pairLoop(event, true)
});
Events.on(engine, "collisionActive", function(event) {
    pairLoop(event, true)
});
Events.on(engine, 'collisionEnd', function(event) {
    pairLoop(event, false);
})

function pairLoop(event, collideState) {
    var pairs = event.pairs
    allowAmt = 0;
    for (var i = 0, j = pairs.length; i != j; ++i) {
        var pair = pairs[i];
        //insert functions here
        playerGroundCheck(collideState, pair);
        playerJumpCheck(collideState, pair);
        whatsTouchingRadial(collideState, pair);
        playerTouchCheck(collideState, pair);
    }
}

function playerGroundCheck(collideState, pair) { //updates player.ground is player is on the ground
    if (pair.bodyA === playerJumpSensor && pair.bodyB.ground === true) {
        player.grounded = collideState;
    } else if (pair.bodyB === playerJumpSensor && pair.bodyA.ground === true) {
        player.grounded = collideState;
    }
}
player.touching = []

function playerTouchCheck(collideState, pair) {
    if (pair.bodyA === player) {
        if (player.touching.includes(pair.bodyB) === false) {
            player.touching.push(pair.bodyB);
        }
        player.collide = collideState;
    } else if (pair.bodyB === player) {
        if (player.touching.includes(pair.bodyA) === false) {
            player.touching.push(pair.bodyA);
        }
        player.collide = collideState;
    }
    for (var r = 0; r < player.touching.length; r++) {
        if (Matter.Collision.collides(player.touching[r], player) == null) {
            player.touching.splice(r, 1);
        }
    }
}

function playerJumpCheck(collideState, pair) { //updates player.jump if player is allowed to jump
    if (pair.bodyA === playerJumpSensor) {
        player.jump = collideState;
    } else if (pair.bodyB === playerJumpSensor) {
        player.jump = collideState;
    }
}
radial.touching = []

function whatsTouchingRadial(collideState, pair) { //adds any object touching radial to radial.touching, and if radial is collided sets radial.collide to true
    if (pair.bodyA === radial) {
        if (radial.touching.includes(pair.bodyB) === false) {
            radial.touching.push(pair.bodyB);
        }
        radial.collide = collideState;
    } else if (pair.bodyB === radial) {
        if (radial.touching.includes(pair.bodyA) === false) {
            radial.touching.push(pair.bodyA);
        }
        radial.collide = collideState;
    }
    for (var r = 0; r < radial.touching.length; r++) {
        if (Matter.Collision.collides(radial.touching[r], radial) == null) {
            radial.touching.splice(r, 1);
        }
    }
}

function getAllObjects() { //bad, you should use Matter.Composite.allBodies(composite) instead
    var allObjects = [],
        allGood = 1,
        k = 0;
    while (allGood == 1) {
        k++;
        if (Matter.Composite.get(engine.world, k, 'body') != null) {
            allObjects.push(Matter.Composite.get(engine.world, k, 'body'))
        }
        if (Matter.Composite.get(engine.world, k, 'body') == null) {
            allGood = 0;
        }
    }
    return allObjects;
}

function colorThemGreenAndWhite() { //yes
    if (radial.touching.length > 0) {
        for (var w = 0; w < radial.touching.length; w++) {
            if (touched.includes(radial.touching[w]) == false) {
              radial.touching[w].lastFillStyle=radial.touching[w].render.fillStyle
                radial.touching[w].render.fillStyle = 'green';
                touched.push(radial.touching[w]);
                w = 0;
            }
        }
    }
    if (touched.length > 0) {
        for (var x = 0; x < touched.length; x++) {
            if (Matter.Collision.collides(touched[x], radial) == null) {
                touched[x].render.fillStyle = touched[x].lastFillStyle;
                touched.splice(x, 1);
                x = 0;
            }
        }
    }
}

function updateSensorPositions() { //this includes camera because I don't want to make another function for it
    Body.setPosition(camera, {
        x: lerp(camera.position.x, player.position.x, 0.25),
        y: lerp(camera.position.y, player.position.y, 0.25) - 20
    });
    //set sensor velocity to zero so it collides properly
    Matter.Body.setVelocity(playerJumpSensor, {
        x: 0,
        y: 0
    })
    //move sensor to below the player
    Body.setPosition(playerJumpSensor, {
        x: player.position.x,
        y: player.position.y + playerRadius + 5
    });
    Matter.Body.setVelocity(radial, {
        x: 0,
        y: 0
    })
    //move sensor to the player
    Body.setPosition(radial, {
        x: player.position.x,
        y: player.position.y
    });
}

function keyCheck() {
    jumpp();
    const limit = 10;
    if ((keys[37]) && abs(player.velocity.x) < limit) {
        if (player.jump) {
            player.force = {
                x: -0.005,
                y: player.force.y
            };
        } else {
            player.force = {
                x: -0.001,
                y: player.force.y
            };
        }
        jumpp();
    } else {
        if ((keys[39] ) && abs(player.velocity.x) < limit) {
            if (player.jump) {
                player.force = {
                    x: 0.005,
                    y: player.force.y
                };
            } else {
                player.force = {
                    x: 0.001,
                    y: player.force.y
                };
            }
            jumpp();
        };
    };

    if (power == true && touched.length > 0 && touchedWanted == null) {
        touchedWanted = touched[0];
        Matter.Body.setVelocity(touchedWanted, {
          x: 0,
          y: 0
      });
      touchedWanted.lastStrokeStyle = touchedWanted.render.strokeStyle
      //touchedWanted.lastFillStyle = touchedWanted.render.fillStyle
      touchedWanted.render.strokeStyle = "lightBlue"

    }
    if (touchedWanted != null) {
      
      if(abs(touchedWanted.position.x-player.position.x)>100||abs(touchedWanted.position.y-player.position.y)>120+getLongestLength(touchedWanted)/2){
        power=false;
      } else {

        Body.setPosition(touchedWanted, {
            x: lerp(touchedWanted.position.x,player.position.x,0.50),
            y: player.position.y - 50 - getLongestLength(touchedWanted)/2,
        });
        Matter.Body.setVelocity(touchedWanted, {
            x: 0,
            y: 0
        });
       
      }
    }
    /*
    if(power==true&&touched.length<=0){
    power==false;

    }
    */
   
    if (power == false && touchedWanted != null) {
        /*Matter.Body.setVelocity(touchedWanted, {
            x: 0,
            y: 0
        })*/
       
        touchedWanted.render.strokeStyle = touchedWanted.lastStrokeStyle
        touchedWanted.render.fillStyle = touchedWanted.lastFillStyle
        touchedWanted = null;
    }

    if(keys[90]&&power==true){
      Matter.Body.rotate(touchedWanted, 0.05)
    }
    if(keys[67]&&power==true){
      Matter.Body.rotate(touchedWanted, -0.05)
    }
    if(keys[65]){

    };
}

function jumpp() {
    if ((keys[38] || keys[87]) && player.jump === true && player.jumpCD < game.cycle) {
        player.jumpCD = game.cycle + 2; //adds a cooldown to jump
        player.force = {
            x: 0,
            y: -0.07
        };
    }
}
grabbedCycle = 0;

function death() {
    grabbedCycle = game.cycle;
    player.render.fillStyle = 'red';
    power = false;
    keyCheck();
    Matter.Body.setVelocity(player, {
        x: 0,
        y: 0
    })
    Body.setPosition(player, {
        x: game.spawn.x,
        y: game.spawn.y
    });
    Body.setPosition(camera, {
        x: game.spawn.x,
        y: game.spawn.y
    });
    player.life = game.fullLife
}
function getLongestLength(object){
  var curBest = 0;
  var curCalc;
  if(object.circleRadius > 0){
    curBest=object.circleRadius*2
  } else {
  for(var u = 0; u < object.vertices.length-1; u++){
    curCalc=distTwoPoints(object.vertices[u].x,object.vertices[u].y,object.vertices[u+1].x,object.vertices[u+1].y)
    if (curCalc>curBest){
      curBest = curCalc
    }
  } 
  curCalc=distTwoPoints(object.vertices[0].x,object.vertices[0].y,object.vertices[object.vertices.length-1].x,object.vertices[object.vertices.length-1].y)
  if (curCalc>curBest){
    curBest = curCalc
  }
}
  return curBest;
}

loadLevel(1); //yay level one
var lastLife;
throwIndicator.amongu==false
Events.on(runner, "beforeTick", function(event) {
  Body.setVelocity(throwIndicator,{
    x:0,
    y:0,
  })
    game.cycle++;
    lastLife = player.life;
    if (game.cycle - grabbedCycle >= 50) {
        player.render.fillStyle = 'lightGrey';
        grabbedCycle = 0;
    }
    lastCameraPosx = camera.position.x;
    lastCameraPosy = camera.position.y;
    keyCheck();
});

Events.on(runner, "afterTick", function(event) {


    colorThemGreenAndWhite();
    updateSensorPositions();
    if (player.position.y > 3000 || player.position.x < 1 || keys[82] || player.life == 0) {
        death();
    }
    if (player.touching.includes(meanBall) == true) {
        player.life--
    }
    if (lastLife > player.life) {
        grabbedCycle = game.cycle;
        player.render.fillStyle = 'red';
    }
    player.render.text.content = player.life;
});
//welcome to rendertown
var canvas = document.getElementById('matterCanvas');
var ctx = canvas.getContext("2d");
ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
ctx.scale(1.5, 1.5)
ctx.translate(-window.innerWidth / 6, -window.innerHeight / 2);
var iWasHavingAMoment = false,
    touchedWanted;
Events.on(render, 'beforeRender', function() {});
Events.on(render, 'afterRender', function() {
    changeX = (abs(camera.position.x) - abs(lastCameraPosx)) * -1
    changeY = (abs(camera.position.y) - abs(lastCameraPosy)) * -1
    ctx.translate(changeX, changeY)
});