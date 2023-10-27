import Godspeed from '@godspeedsystems/core';
import express from 'express';

// create a godspeed with existing express app instance
// godspeed will re use that, and you can run godspeed side by side

// fetch ENVs
const gsApp = new Godspeed();

// initilize the Godspeed App
// this us responsible to load all kind of entities
gsApp.initialize();

// already existing express instance
const expressApp = express();
export { expressApp };