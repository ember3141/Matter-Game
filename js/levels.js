function loadLevel(levelNum) {
    if (levelNum == 1) {
        game.spawn.x = 300;
        game.spawn.y = game.height - 300;
        offset = 5;
        theGround = Bodies.rectangle(400, game.height + offset, game.width *  + 2 * offset, 50, {
            isStatic: true,
            ground: true,
            render: {
                strokeStyle: 'black',
                lineWidth: objectStroke,
                fillStyle: "grey"
            }
        });
        Composite.add(engine.world, [ //platforms
             Bodies.rectangle(800, game.height -150, 500, 50, {
            isStatic: true,
            ground: true,
            collisionFilter: {
                category: CATEGORY_GROUND
            },
            render: {
                strokeStyle: 'green',
                lineWidth: objectStroke,
                fillStyle: "grey"
            }
        }),
        Bodies.rectangle(1200, game.height -300, 300, 50, {
            isStatic: true,
            ground: true,
            collisionFilter: {
                category: CATEGORY_GROUND
            },
            render: {
                strokeStyle: 'green',
                lineWidth: objectStroke,
                fillStyle: "grey"
            }
        })
    ]); //end of platforms
        box = Bodies.rectangle(550, game.height - 200, 50, 50, {
            render: {
                strokeStyle: 'black',
                lineWidth: objectStroke,
                fillStyle: "darkBlue"
            }
        });
        ramp = Bodies.trapezoid(500, game.height - 200, 100, 90, 2, {
            render: {
                strokeStyle: 'black',
                lineWidth: objectStroke,
                fillStyle: "darkBlue"
            }
        })
        meanBall = Bodies.circle(700, game.height - 200, 25, {
            render: {
                strokeStyle: 'red',
                lineWidth: objectStroke,
                fillStyle: "darkBlue"
            }
        });
        for(var t = 0; t < 25; t++){
            Composite.add(engine.world, [
                Bodies.rectangle(1500+(t*50),game.height -200,25,25+t*5,{
                    collisionFilter: {
                        category: CATEGORY_COLLIDABLE | CATEGORY_OBJECTS
                    },
                    render:{
                        strokeStyle: 'black',
                        lineWidth: objectStroke,
                        fillStyle: 'rgb('+t*7+','+t*7+','+t*7+')'
                    }
                })
            ]);
        }
        theGround.collisionFilter.category = CATEGORY_GROUND
        box.collisionFilter.category = CATEGORY_COLLIDABLE | CATEGORY_OBJECTS
        ramp.collisionFilter.category = CATEGORY_COLLIDABLE | CATEGORY_OBJECTS
        meanBall.collisionFilter.category = CATEGORY_COLLIDABLE | CATEGORY_OBJECTS
        Composite.add(engine.world, [
            box,
            ramp,
            meanBall,
            theGround
        ]);
    }
}