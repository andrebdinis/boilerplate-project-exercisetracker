const express = require('express')
const app = express()
const cors = require('cors')
const mongoose = require("mongoose"); // added
const bodyParser = require('body-parser'); // added
require('dotenv').config()

// Connect to MongoDB (Database name: "exerciseTrackerDB")
const MONGO_URI = process.env.MONGO_URI;
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to database"))
  .catch(err => console.error("Could not connect to database", err) );

app.use(cors());
app.use(bodyParser.json()); // added
app.use(bodyParser.urlencoded({extended: false})); // added
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

//----------------------- ROOT-LOGGER --------------------//
app.use((req, res, next) => {
  console.log(req.method, req.path/*, req.ip*/);
  next();
});

//-------------------------- ROUTES ----------------------//
// "Create a New User" FORM
app.post("/api/users", (req, res) => {
  // Create and save user
  const newUser = createUser(req.body.username);
  saveUser(newUser, res);
});

// List All Users
app.get("/api/users", (req, res, next) => {
  listUsers(res);
})

// "Add exercises" FORM
app.post("/api/users/:_id/exercises", (req, res, next) => {
  // Validate user id
  const userId = req.params._id;
  User.findById(userId, (err, data) => {
    if(err) return printError("Error: User ID does not exist", res);
    // User found

    // Validate exercise fields
    const validatedObj = validateExerciseFields(req.body.description, req.body.duration, req.body.date, res);
  
    // create exercise object and add it to user's log
    const exerciseObj = buildExerciseObj(validatedObj.description, validatedObj.duration, validatedObj.date);
    data.log.unshift(exerciseObj);
    data.count = data.log.length;
    
    // save user with new exercise added
    data.save((err, data) => {
      if(err) return printError("Error: Could not save user", res);
      // user saved
      const username = data.username;
      console.log(`Exercise log ${JSON.stringify(exerciseObj)} added to user ${username} (ID: ${userId})`);
      
      // build final exercise object with id and username
      // and respond with json
      const exerciseObjResponse = buildExerciseObjResponse(userId, username, exerciseObj);
      res.json(exerciseObjResponse);
    });
  });
});

// List a User's Exercise Log (with or without parameters)
/*
// GET /api/users/:_id/logs?[from][&to][&limit]
//   [ ] = optional
//   from, to = dates (yyyy-mm-dd); limit = number
*/
app.get("/api/users/:_id/logs", (req, res) => {
  //printRequestObjects(req);

  // Validate user id
  const userId = req.params._id;
  User.findById(userId, (err, data) => {
    if(err) return printError("Error: User ID does not exist", res);
    // user found

    // if req.query object has properties
    if(objectHasProps(req.query)){
      
      // validate properties (if undefined, set as null)
      const validatedObj = validateReqQueryProps(req.query.from, req.query.to, req.query.limit)

      // array to filter by dates (from, to)
      let filteredLogArray = filterLogByDatesArray(data.log, validatedObj.from, validatedObj.to);

      // array to limit (in number of documents)
      let limitedLogArray = filterLogByLimitArray(filteredLogArray, validatedObj.limit);

      // Remove "_id" field from Log array items 
      const idLessLogArray = buildIdLessLogArray(limitedLogArray);
      return res.json(buildVersionLessUserObj(data, idLessLogArray));
    }
    // else, req.query object is empty
    else {
      // print the complete exercise log of a User ID
      const idLessLogArray = buildIdLessLogArray(data.log);
      return res.json(buildVersionLessUserObj(data, idLessLogArray));
    }
  });
});


//------------------------ MONGOOSE -----------------------//
// Subdocuments: https://mongoosejs.com/docs/subdocs.html

// -----------MONGOOSE AUXILIARY FUNCTIONS -------------- //
// LIST
function listUsers(res) {
  User.find({}, (err, data) => {
    if(err) return console.error(err);
    res.send(data);
  });
}
// USER
function createUser(username) {
  return new User({
    username: username
  });
}
function saveUser(user, res) {
  user.save((err, data) => {
    if(err) return console.error("Error:", err);
    
    // New user saved
    console.log(`New user (${data.username}) saved`);
    console.log("Data:", data);
    
    // respond with json object
    return res.json({
      _id: data._id,
      username: data.username
    });
  });
}

//------------------ EXERCISE -----------------//
// Exercise Schema (child)
const exerciseSchema = new mongoose.Schema({
  description: { type: String, required: [true, "Description required"] },
  duration: { type: Number, required: [true, "Duration required"] },
  date: { type: String }
});

//------------------ USER -----------------//
// User Schema (parent)
const userSchema = new mongoose.Schema({
  //_id: mongoose.ObjectId,
  username: { type: String, required: [true, "Username required"] },
  count: { type: Number, default: 0 },
  log: [exerciseSchema]
});
// Model Instance
// Note: Creates "users" collection in database
const User = new mongoose.model("User", userSchema, "users");


//----------------------- AUXILIARY FUNCTIONS ----------------//
// PRINT
function printError(errorMessage, res){
  console.log(errorMessage);
  res.send(errorMessage);
}
function printRequestObjects(req){
  console.log(
`GET REQUEST:
Body: ${Object.keys(req.body).length > 0}`, req.body,
`\nParams: ${Object.keys(req.params).length > 0}`, req.params,
`\nQuery: ${Object.keys(req.query).length > 0}`, req.query
  );
}
// VALIDATE FIELDS

function validateDescription(value, lengthLimit, res){
  if(value === "" || value === undefined) {
    return printError(`Error: Description required (field can not be empty)`, res);
  }
  if(value.length > lengthLimit)
    return printError(`Error: Description must not exceed ${lengthLimit} characters`, res);
  return value;
}
function validateNumber(value){
  if(value === undefined) {
    return null;
  }
  const isNumber = !isNaN(Number(value));
  return !isNumber ?
    null
    : Number(value);
}
function validateDuration(value, res){
  const duration = validateNumber(value);
  if(duration === null)
    return printError("Error: Duration must be a number", res);
  return duration;
}
function validateDate(value){
  const regexDate = /[\d]{4}-[\d]{2}-[\d]{2}/;
  const dateMatch = value.match(regexDate);
  return dateMatch === null ?
    null
    : new Date(value).toDateString();
}
function validateDateForExercise(value){
  if(value === undefined) {
    return new Date().toDateString(); // get actual date
  }
  const date = validateDate(value);
  return date === null ?
    new Date().toDateString() // get actual date
    : date;
}
function validateDateIntoLiteral(value){
  if(value === undefined){
    return null;
  }
  return validateDate(value) === null ?
    null
    : new Date(value);
}
function validateExerciseFields(description, duration, date, res) {
  // REQUIRED: validate description (with 20 char limit)
  const desc = validateDescription(description, 20, res);
  // REQUIRED: validate duration
  const dur = validateDuration(duration, res);
  // OPTIONAL: validate date (if not set, then actual date)
  const dat = validateDateForExercise(date);
  return {description: desc, duration: dur, date: dat};
}
function validateReqQueryProps(from, to, limit) {
  // validate properties (if undefined, set as null)
  // OPTIONAL: validate "from" date
  const fr = validateDateIntoLiteral(from);
  // OPTIONAL: validate "to" date
  const t = validateDateIntoLiteral(to);
  // OPTIONAL: validate "limit" of documents
  const lim = validateNumber(limit) === null ?
      0
      : Number(limit)
  return {from: fr, to: t, limit: lim};
}
// BUILD OBJECTS
function buildExerciseObj(description, duration, date){
  return {
    description: description,
    duration: duration,
    date: date
  };
}
function buildExerciseObjResponse(userId, username, exerciseObject){
  return Object.assign(
          {
            _id: userId,
            username: username
          }, 
          exerciseObject
        );
}
function buildVersionLessUserObj(data, logArray){
  // removes "__v" from user object
  return {
    _id: data._id,
    username: data.username,
    count: logArray.length,
    log: logArray
  }
}
// BUILD ARRAYS
function buildIdLessLogArray(logArray){
  // removes "_id" from log array items
  let idLessLogArray = [];
  logArray.map((d, i) => {
    idLessLogArray.push (
      {
        description: d.description,
        duration: d.duration,
        date: d.date
      });
  });
  return idLessLogArray;
}
function filterLogByDatesArray(logArray, fromDate, toDate){
  let filteredLogArray = [];
  logArray.map((d, i) => {
    let status = "PUSH";
    let date = new Date(d.date);
    
    if(fromDate !== null){
      if(date >= fromDate){}
      else { status = "POP"}
    }
    if(toDate !== null){
      if(date <= toDate){}
      else { status = "POP"}
    }

    if(status === "PUSH")
      filteredLogArray.push(d);
  });
  return filteredLogArray;
}
function filterLogByLimitArray(logArray, limit){
  let limitedLogArray = [];
  if (limit !== null) {
    logArray.map((d, i) => {
      if (limit === 0 || limit > i)
        limitedLogArray.push(d);
    })
  }
  else {
    limitedLogArray = [].concat(logArray);
  }
  return limitedLogArray;
}
// CHECK PROPERTIES
function objectHasProps(object){
  return Object.keys(object).length > 0;
}



const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
