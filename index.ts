// Welcome to
// __________         __    __  .__                               __
// \______   \_____ _/  |__/  |_|  |   ____   ______ ____ _____  |  | __ ____
//  |    |  _/\__  \\   __\   __\  | _/ __ \ /  ___//    \\__  \ |  |/ // __ \
//  |    |   \ / __ \|  |  |  | |  |_\  ___/ \___ \|   |  \/ __ \|    <\  ___/
//  |________/(______/__|  |__| |____/\_____>______>___|__(______/__|__\\_____>
//
// This file can be a nice home for your Battlesnake logic and helper functions.
//
// To get you started we've included code to prevent your Battlesnake from moving backwards.
// For more info see docs.battlesnake.com

import runServer from './server';
import { Coord, Game, GameState, InfoResponse, MoveResponse, DisplayBoard, DisplayBoardRow, DisplayBoardSpace, KeyCode, SnakePiece } from './types';

// info is called when you create your Battlesnake on play.battlesnake.com
// and controls your Battlesnake's appearance
// TIP: If you open your Battlesnake URL in a browser you should see this data
function info(): InfoResponse {
  console.log("INFO");

  return {
    apiversion: "1",
    author: "g-wittig", // Your Battlesnake Username
    color: "#38FF02", // Choose color
    head: "gamer",  // Choose head
    tail: "nr-booster",  //  Choose tail
  };
}

// start is called when your Battlesnake begins a game
function start(gameState: GameState): void {
  console.log("GAME START");
}

// end is called when your Battlesnake finishes a game
function end(gameState: GameState): void {
  console.log("GAME OVER\n");
}

// move is called on every turn and returns your next move
// Valid moves are "up", "down", "left", or "right"
// See https://docs.battlesnake.com/api/example-move for available data
function move(gameState: GameState): MoveResponse {
  const displayBoard = generateDisplayBoard(gameState);
  // displayBoardState(gameState, displayBoard);

  // Setup variables
  const mySnake = gameState.you;
  const myHead = mySnake.body[0];
  const myTail = mySnake.body[mySnake.body.length - 1];
  const allSnakes = gameState.board.snakes;
  const enemySnakeHeads: Coord[] = [];
  const maxValueY = gameState.board.height - 1; // board coordinates are zero indexed
  const maxValueX = gameState.board.width - 1; // board coordinates are zero indexed
  const foodSpaces = gameState.board.food;

  let isMoveSafe: { [key: string]: boolean; } = {
    up: true,
    down: true,
    left: true,
    right: true
  };

  const nearbySpaces: { [key: string]: Coord; } = {
    up: { ...myHead, y: myHead.y + 1},
    down: { ...myHead, y: myHead.y - 1},
    left: { ...myHead, x: myHead.x - 1},
    right: { ...myHead, x: myHead.x + 1},
  };

  // Only do path finding if there are hazards (ex. maze), doing this path finding on an open grid takes way to much effort
  if (shouldPathFind(gameState)) {
    // this should contain up to the 4 directions ( up, down, left, right), and a path array?
    let theRecord: any = {}; // get an actual type for this later.....
    theRecord['up'] = recursivePathFinding(displayBoard, theRecord, 'up', myHead.x, myHead.y + 1);
    theRecord['down'] = recursivePathFinding(displayBoard, theRecord, 'down', myHead.x, myHead.y - 1);
    theRecord['left'] = recursivePathFinding(displayBoard, theRecord, 'left', myHead.x - 1, myHead.y);
    theRecord['right'] = recursivePathFinding(displayBoard, theRecord, 'right', myHead.x + 1, myHead.y);
    console.log('the record after recuse', theRecord)
    const shortestPath = getShortestPathFromRecord(theRecord);
    console.log('shortest determined path is:', shortestPath);
    // TODO: this null check might be unecessary later if the code is improved.
    if (shortestPath != null) {
      const shortestDirection = Object.keys(shortestPath[0])[0];
      console.log('found the shortest path to the food!')
      console.log(`MOVE ${gameState.turn}: ${shortestDirection}`);
      return { move: shortestDirection };
    }
  } 

  // Get array of all currently blocked spaces, currently includes all snake bodies
  let blockedSpaces: Coord[] = [];
  for (let index = 0; index < allSnakes.length; index++) {
    const snake = allSnakes[index];
    if (snake.id != mySnake.id) {
      // This is an enemy snake
      enemySnakeHeads.push(snake.body[0])
    }
    // Add body of snake to blocked spaces
    blockedSpaces = [...blockedSpaces, ...snake.body];
  }
  // Add hazards to blocked spaces
  blockedSpaces = [...blockedSpaces, ...gameState.board.hazards];

  // filter blockedSpaces to remove duplciate values (start of game as all parts of a snake in the same square)
  blockedSpaces = blockedSpaces.filter((blockedSpace, index, self) => {
    return self.findIndex(item => areCoordsEqual(item, blockedSpace)) === index
  });

  // Main movement logic:

  // Loop through nearby spaces to check if they are they are safe to move:
  Object.entries(nearbySpaces).forEach(([direction, nearbySpace]) => {
    // Can't move in given direction beacuse that space is off of the board.
    if ((nearbySpace.x < 0 || nearbySpace.x > maxValueX) || (nearbySpace.y < 0 || nearbySpace.y > maxValueY)) {
      isMoveSafe[direction] = false;
      return;
    }

    // if the current nearby space is found in the array of blocked spaces then we can't move there
    if (blockedSpaces.findIndex(item => areCoordsEqual(item, nearbySpace)) != -1) {
      isMoveSafe[direction] = false;
      return;
    }
  });

  // Are there any safe moves left?
  const safeMoves = Object.keys(isMoveSafe).filter(key => isMoveSafe[key]);
  if (safeMoves.length == 0) {
    // If there are no safe moves, move down by default.
    let forcedDirection = 'down';

    Object.entries(nearbySpaces).forEach(([direction, nearbySpace]) => {
      // If own snake tail is on one of the nearby spaces try moving there as it should be safe unless you ate food last turn (fingers crossed)
      if (areCoordsEqual(nearbySpace, myTail)) {
        forcedDirection = direction;
      }
    });

    console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving ${forcedDirection}`);
    return { move: forcedDirection };
  } else if (safeMoves.length == 1) {
    console.log(`MOVE ${gameState.turn}: ${safeMoves[0]} (only safe move detected!)`);
    return { move: safeMoves[0] };
  }

  // Only run food logic if there is food on the board.
  if (foodSpaces.length != 0) {
    const minimumFoodMovesPerDirection: { [key: string]: number; } = {};

    // For given safe moves, see which move makes you closest to a piece of food and move that way?
    safeMoves.forEach(direction => {
      const nearbySpace = nearbySpaces[direction];
      // set to max amount of board movement as a default value
      minimumFoodMovesPerDirection[direction] = gameState.board.height * gameState.board.width;
      foodSpaces.forEach(foodSpace => {
        const numberOfMoves = directMovementBetweenCoords(nearbySpace, foodSpace);
        minimumFoodMovesPerDirection[direction] = Math.min(minimumFoodMovesPerDirection[direction], numberOfMoves);
      });
    })
    const sortedFoodMoves = Object.entries(minimumFoodMovesPerDirection).sort((a, b) => a[1] - b[1]);

    for (let index = 0; index < sortedFoodMoves.length; index++) {
      const foodMove = sortedFoodMoves[index];
      const direction = foodMove[0];
      const nearbySpace = nearbySpaces[direction];
  
      if (!isSpaceNextToEnemySnakeHead(nearbySpace, enemySnakeHeads)) {
        // Food is on a nearby space and there isn't an enemy snake that could move to that space.
        console.log(`MOVE ${gameState.turn}: ${direction}`);
        return { move: direction };
      }
    }
  }

  // If there was no 'safe' direction to take towards a piece of food, randomly move in any direction determined as safe:
  const nextMove = safeMoves[Math.floor(Math.random() * safeMoves.length)];

  console.log(`MOVE ${gameState.turn}: ${nextMove} - Random Direction`)
  return { move: nextMove };
}

runServer({
  info: info,
  start: start,
  move: move,
  end: end
});

const areCoordsEqual = (coord1: Coord, coord2: Coord): boolean => coord1.x == coord2.x && coord1.y == coord2.y;

const directMovementBetweenCoords = (start: Coord, end: Coord): number => {
  const differenceX = Math.abs(start.x - end.x);
  const differenceY = Math.abs(start.y - end.y);
  return differenceX + differenceY;
};

const isSpaceNextToEnemySnakeHead = (space: Coord, enemySnakeHeads: Coord[]): boolean => {
  for (let index = 0; index < enemySnakeHeads.length; index++) {
    const enemySnakeHead = enemySnakeHeads[index];
    if (directMovementBetweenCoords(space, enemySnakeHead) == 1) {
      // An enemy snake head is beside this space
      return true;
    }
  }
  return false;
};

const generateDisplayBoard = (gameState: GameState): DisplayBoard => {
  const mySnake = gameState.you;
  const mySnakeId = mySnake.id;
  const allSnakes = gameState.board.snakes;
  const foodSpaces = gameState.board.food;
  const hazardSpaces = gameState.board.hazards;

  const board: DisplayBoard = [];

  // Setup defaults for the board.

  /**
   * 0,0 1,0 2,0
   * 0,1 1,1 2,1 // this is how the array will be stored, which is upside down from how the actual board is displayed, since the board has the Y axis zero at the bottom instead of the top.
   * 0,2 1,2 2,2
   */
  for (let i = 0; i < gameState.board.height; i++) {
    const emptyBoardRow: DisplayBoardRow = [];
    
    for (let j = 0; j < gameState.board.width; j++) {
      const emptySpace: DisplayBoardSpace = { type: 'empty', keyCode: '@', coord: { x: j, y: i } };
      emptyBoardRow.push(emptySpace);
    }
    board.push([...emptyBoardRow]);
  }

  // Add food spaces to display board
  for (let index = 0; index < foodSpaces.length; index++) {
    const foodSpace = foodSpaces[index];
    const node: DisplayBoardSpace = { type: 'food', keyCode: 'F', coord: foodSpace };
    board[foodSpace.y][foodSpace.x] = node;
  }

  // Add snakes to display board
  for (let i = 0; i < allSnakes.length; i++) {
    const snake = allSnakes[i];
    // Use 'M' as keycode for my snake head, and 'H' for other snakes
    const headKeyCode: KeyCode = snake.id == mySnakeId ? 'M' : 'H';

    // Reverse through snake to place body pieces just so that at the start of the game the head is processed last and is the only piece displayed rather than the tail
    for (let j = snake.body.length - 1; j >= 0; j--) {
      let keyCode: KeyCode = 'S';
      let snakePiece: SnakePiece = 'body'; 
      switch (j) {
        case 0: // Head of the snake
          keyCode = headKeyCode;
          snakePiece = 'head';
          break;
        case snake.body.length - 1: // Tail of the snake
          snakePiece = 'tail';
          keyCode = 'T';
          break;
      }

      const snakeSpace = snake.body[j];
      const node: DisplayBoardSpace = { type: 'snake', snakePiece: snakePiece, snakeId: snake.id, keyCode: keyCode, coord: snakeSpace };
      board[snakeSpace.y][snakeSpace.x] = node;
    }
  }

  // Add hazards to display board
  for (let index = 0; index < hazardSpaces.length; index++) {
    const hazardSpace = hazardSpaces[index];
    const node: DisplayBoardSpace = { type: 'hazard', keyCode: 'X', coord: hazardSpace };
    board[hazardSpace.y][hazardSpace.x] = node;
  }

  return board;
};

const displayBoardState = (gameState: GameState, board: DisplayBoard): void => {
  console.log('Current Board State:')
  console.log('--'.repeat(gameState.board.width));
  // reverse loop through board rows as the y axis is zero index from bottom to top
  for (let i = board.length - 1; i >= 0; i--) {
    const currentRow = board[i]
    let currentRowString = '';
    for (let j = 0; j < currentRow.length; j++) {
      const currentSpace = currentRow[j];
      currentRowString += ` ${currentSpace.keyCode}`;
    }
    console.log(currentRowString.trim());
  }
  console.log('--'.repeat(gameState.board.width));
};

const getSpaceByCoordinates = (displayBoard: DisplayBoard, x: number, y: number): DisplayBoardSpace | null => {
  // board coordinates match up to indexs of the array (although the visual representation of the board is reversed for the y axis, but that doesn't matter here)
  if (y > displayBoard.length - 1 || y < 0 || x > displayBoard[0].length -1 || x < 0) {
    // Out of the bounds of the board, so don't return a space.
    return null;
  }
  return displayBoard[y][x];
};

const recursivePathFinding = (displayBoard: DisplayBoard, theRecord: any, direction: string, x: number, y: number): any => {
    const thisCoordString: string = `x: ${x}, y: ${y}`;
    let currentPath: any[] = [];
    if (theRecord.path) {
      // if the record at the current level has a path attribute (top level shouldn't have since it is the first step in the path)
      // copy that path to be the 'base' value of this value
      currentPath = [...theRecord.path];
    }
    
    // add the curretn direction and cooridate to our current path
    currentPath.push({ [direction]: thisCoordString });

    // create entry for current direction to the current step of the path
    const currentRecord: any = { path: currentPath };

    const space = getSpaceByCoordinates(displayBoard, x, y);
    // given a coord, and the 'record' thing
      // get its space type
      // if it is a bad space (hazard, snake, oob, etc) return null (or some 'bad' value)
      // if it is empty, recall this method up to 4 times with all the associated squares
        // strech goal would be reciving the current 'path' as well so we don't go backwards, and if the path holds the related coords it could check if we are going backwards onto our entire path at all
      // keep going until finding food as the base case
    // afterwards we should be able to do some calcuation to see which path is the shortest and try to go that way  

    if (space) {
      if (space.type == 'hazard') {
        // console.log('space requested at x:', x, ' y:', y, 'is a hazard');
        currentRecord[direction] = null;
        return currentRecord;
      }
      if (space.type == 'snake') {
        // console.log('space requested at x:', x, ' y:', y, 'is a snake part, specifically a ', space.snakePiece);
        currentRecord[direction] = null;
        return currentRecord;
      }
      if (space.type == 'food') {
        // console.log('space requested at x:', x, ' y:', y, 'is a piece of food');
        // currentRecord[direction] = 'food';
        // TODO: return the direction from the first part of the path, as that is the direction we should go?
        return currentPath;
      }

      // if not one of the spaces above, it's an empty space.
      // call the recursive method for each four direction (with some stipulations)

      // TODO: should the path be changed to just be an array of coordinates? that might be better if we don't need to store the direction we used to reach that space
      const currentPathByCoords: any[] = [];
      currentPath.forEach(item => {
        const value = Object.values(item)[0];
        currentPathByCoords.push(value);
      });



      if (direction != 'down' && !currentPathByCoords.includes(`x: ${x}, y: ${y + 1}`)) {
        // call the method with coordinates for the space above, but only if we didn't move down to get to this space (avoid backwards)
        currentRecord['up'] = recursivePathFinding(displayBoard, currentRecord, 'up', x, y + 1);
        // console.log('the record after up:', currentRecord)
      }
      if (direction != 'left' && !currentPathByCoords.includes(`x: ${x + 1}, y: ${y}`)) {
        // call the method with coordinates for the space to the right, but only if we didn't move left to get to this space (avoid backwards)
        currentRecord['right'] = recursivePathFinding(displayBoard, currentRecord, 'right', x + 1, y);
        // console.log('the record after right:', currentRecord)
      }
      if (direction != 'up' && !currentPathByCoords.includes(`x: ${x}, y: ${y - 1}`)) {
        // call the method with coordinates for the space below, but only if we didn't move up to get to this space (avoid backwards)
        // and if the coords to check aren't already in our path (don't revisit previous squares.)
        currentRecord['down'] = recursivePathFinding(displayBoard, currentRecord, 'down', x, y - 1);
        // console.log('the record after down:', currentRecord)
      }
      if (direction != 'right' && !currentPathByCoords.includes(`x: ${x - 1}, y: ${y}`)) {
        // call the method with coordinates for the space to the left, but only if we didn't move right to get to this space (avoid backwards)
        currentRecord['left'] = recursivePathFinding(displayBoard, currentRecord, 'left', x - 1, y);
        // console.log('the record after left:', currentRecord)
      }

      const shortestPath = getShortestPathFromRecord(currentRecord);
      if (shortestPath != null) {
        // if no shortest paths were found then we don't want to return any paths
        return shortestPath;
      }
    } else {
      // The request space is out of the bounds of the board.
      return null;
    }
    return currentRecord;
};

const getShortestPathFromRecord = (record: any) => {
  const pathLengthToFoodByDirection: { [key: string]: number; } = {};

  if (Array.isArray(record['up'])) {
    pathLengthToFoodByDirection['up'] = record['up'].length;
  }
  if (Array.isArray(record['right'])) {
    pathLengthToFoodByDirection['right'] = record['right'].length;
  }
  if (Array.isArray(record['down'])) {
    pathLengthToFoodByDirection['down'] = record['down'].length;
  }
  if (Array.isArray(record['left'])) {
    pathLengthToFoodByDirection['left'] = record['left'].length;
  }
  const sortedPaths = Object.entries(pathLengthToFoodByDirection).sort((a, b) => a[1] - b[1]);

  if (sortedPaths.length != 0) {
    // get the shortest path by using the direction from the first record in the sorted paths
    const shortestPath = record[sortedPaths[0][0]];
    return shortestPath;
  }
  // This should only be reached when this function is used during recusion. when used at top level function
  // we should always have some 'shortest path', or else there would be no way to get to the food.
  return null;
};

const shouldPathFind = (gameState: GameState): boolean => {
  // The amount of the board that has to be filled for us to start trying to path find (hopefully saftely)
  const fillPercent = 0.5; // currently 50%
  // we only want to path find on certain conditions, like if there are a bunch of hazards, or other snakes.
  const totalBoardSpaces = gameState.board.height * gameState.board.width;
  let filledSpaces = 0;
  filledSpaces += gameState.board.hazards.length;
  gameState.board.snakes.forEach(snake => filledSpaces += snake.body.length);
  return (filledSpaces / totalBoardSpaces) >= fillPercent; 
};

/**
 * Notes:
 * x is 0 to board length, left to right, y is 0 to board height from bottom to top, so 0,0 is the bottom left corner
 */
