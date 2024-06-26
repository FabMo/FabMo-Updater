/*
 * authentication.json
 *
 * Routes related to user/authentication management.
 */
var log = require('../log').logger('authentication');
var authentication = require('../authentication');
var passport = authentication.passport;

// // Authenticate as the provided user
function login(req, res, next) {
  console.log('Login request received');
  authentication.passport.authenticate('local', function(err, user, info) {
    if (err) {
      console.log('Authentication error:', err);
      return next(err); // will generate a 500 error
    }
    if (!user) {
      console.log('Authentication failed:', info.message);
      return res.send(401, { status: 'error', message: info.message, userAlreadyLogedIn: info.userAlreadyLogedIn });
    }

    // Set user information in the session
    req.session.user = {
      id: user.id,
      username: user.username,
      // Add any other user information you need
    };

    console.log('User authenticated:', user);
    authentication.setCurrentUser(user);
    return res.send({ status: 'success', message: 'authentication succeeded' });
  })(req, res, next);
}

// Add a user
// TODO - is this route really needed in the updater?  (Maybe?)
var addUser = function(req, res, next) {

  currentUser = authentication.getCurrentUser();
  if(currentUser && currentUser.isAdmin){
    if(req.params.user===undefined || req.params.user.username==undefined || req.params.user.password==undefined){
      res.send(200,{ status:'error', message:'you need to provide an object with a user object inside containing a username AND a password'});
      return;
    }else{
      authentication.addUser(req.params.user.username,req.params.user.password,function(err,user){
        if(err){
          res.send(200,{ status:'error', message:err});
          return;
        }else{
          res.send(200,{ status:'success', data : user});
          return;
        }
      });
    }
  }else {
    res.send(200,{status:'error',message:"you need to be admin to register new users"});
    return;
  }

};

// Deauthenticate the current user
var logout = function(req, res, next) {
  req.logout();
  authentication.setCurrentUser(null);
  res.send(200, {status:'success', data : "User logged out"});
  return;
};

// Get the list of users
// TODO - is this route really needed in the updater?  (Maybe?)
var getUsers = function(req,res,next){
  currentUser = authentication.getCurrentUser();
  if(currentUser && currentUser.isAdmin){ // if admin
    authentication.getUsers(function(err,users){
      if(err){
        res.send(200,{status:'error',message:err});
        return;
      }
      res.send(200,{status:'success',data:users});
      return;
    });
  }else {
    res.send(200,{status:'error',message:"you need to be admin to get users info"});
    return;
  }
};

// Get the user with the provided ID
// TODO - is this route really needed in the updater?  (Maybe?)
var getUser = function(req,res,next){
  currentUser = authentication.getCurrentUser();
  if(currentUser &&( (currentUser.username == req.params.id ) || currentUser.isAdmin)){ // if current user or admin
    authentication.getUser(req.params.id,function(err,user){
      if(err){
        res.send(200,{status:'error',message:err});
        return;
      }
      res.send(200,{status:'success',data:user});
      return;
    });
  }else {
    res.send(200,{status:'error',message:"you need to be admin or request your own id to get the user info"});
    return;
  }
};

// Get the current user
var getCurrentUser = function(req,res,next){
  currentUser = authentication.getCurrentUser();
  if(currentUser){ // if current user
    authentication.getUser(currentUser.username,function(err,user){
      if(err){
        res.send(200,{status:'error',message:err});
        return;
      }
      res.send(200,{status:'success',data:user});
      return;
    });
  }else {
    res.send(200,{status:'error',message:"you need to be connected to request your own user info"});
    return;
  }
};

// Update a user
// TODO - is this route really needed in the updater?  (Maybe?)
var modifyUser = function(req,res,next){
  currentUser = authentication.getCurrentUser();
  if(!req.params.id){
    res.send(200,{status:'error',message:"no username provided"});
    return;
  }
  if(currentUser &&(currentUser.username == req.params.username || currentUser.isAdmin)){ // if current user or admin
    if(!req.params.user){
      res.send(200,{status:'error',message:"no user object provided"});
      return;
    }
    authentication.modifyUser(req.params.id,req.params.user,function(err,user){
      if(err){
        res.send(200,{status:'error',message:err});
        return;
      }
      res.send(200,{status:'success',data:user});
      return;
    });
  }else {
    res.send(200,{status:'error',message:"you need to be admin or request your own id to modify the user info"});
    return;
  }
};

// Remove a user
// TODO - is this route really needed in the updater?  (Maybe?)
var deleteUser = function(req,res,next){ // if admin
  currentUser = authentication.getCurrentUser();
  if(currentUser && currentUser.isAdmin){ // if admin
    authentication.deleteUser(req.params.id,function(err,user){
      if(err){
        res.send(200,{status:'error',message:err});
        return;
      }
      res.send(200,{status:'success'});
      return;
    });
  }else {
    res.send(200,{status:'error',message:"you need to be admin to delete users"});
    return;
  }
};

module.exports = function(server) {
  server.post('/authentication/login', login);
  server.get('/authentication/logout',passport.authenticate('local'), logout);
  server.get('/authentication/user',passport.authenticate('local'), getCurrentUser);// return current user info.
  server.post('/authentication/user',passport.authenticate('local'), addUser);//only authenticated user can add new users.
  server.get('/authentication/users',passport.authenticate('local'), getUsers);
  server.get('/authentication/user/:id',passport.authenticate('local'), getUser);
  server.post('/authentication/user/:id',passport.authenticate('local'), modifyUser);
  server.del('/authentication/user/:id',passport.authenticate('local'), deleteUser);

};