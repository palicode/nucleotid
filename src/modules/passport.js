const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const crypto = require('crypto');
const db = require('../modules/db');
const users = require('../models/user');

// Configure local strategy.
passport.use(
  new LocalStrategy(
    // Strategy options.
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    // Local login function.
    async function(email, passwd, done) {
      console.log('AUTH: local strategy');
      var user = await users.findByEmail(email);
      if (!user) {
	console.log('AUTH-DENIED: User not found.');
	return done(null, false);
      }

      if (!user._data.web_active) {
	if (user._data.google_active) {
	  console.log('AUTH-DENIED: Web-login attempt from Google user.');
	  return done(null, false);
	} else {
	  console.log('AUTH-DENIED: User not verified.');
	  return done(null, false);
	}
      }

      console.log('AUTH: User found in database.');
      const hash = crypto.createHash('sha256');
      
      // TODO: Check password < MAX_PASSWORD_LEN.
      var pwdhash = hash.update(passwd).digest('hex');

      if (pwdhash == user._data.password) {
	console.log('AUTH-SUCCESS: Password match!');
	return done(null, user);
      }

      console.log('AUTH-DENIED: Wrong password.');
      return done(null, false);
    }
  )
);

// Configure Google OAUTH 2.0.
passport.use(
  new GoogleStrategy(
    // Strategy options.
    {
      clientID: process.env.GOOGLE_OAUTH_CLIENTID,
      clientSecret: process.env.GOOGLE_OAUTH_SECRET,
      callbackURL: 'http://nucleotid-dev.com:3000/login/google/return'
    },
    // Google login function.
    async function(accessToken, refreshToken, profile, done) {
      try {
	// Find user by Google ID.
	var user = await users.findByGoogleId(profile.id);
	if (!user) {
	  console.log('Google ID not found.');
	  // Try to find user by e-mail.
	  user = await users.findByEmail(users.emailFromGoogleProfile(profile));

	  // User does not exist -> create it.
	  if (!user) {
	    var userinfo = users.userFromGoogleProfile(profile);
	    console.log('User not found, creating user.');
	    user = await users.newUser(userinfo);
	    // Log new user in (e-mail is verified).
	    return done(null, user);
	  }
	  
	  // First Google login -> activate Google.
	  console.log('Web user exists, activating google profile.');
	  await user.activateGoogleProfile(user.id, profile);
	}
	console.log('Google id found! Logging in!');
	// User found -> log user in.
	return done(null, user);
      } catch (err) {
	console.log(err);
	return done(err);
      }
    }
  )
);

// TODO:
// This serializes the user information across HTTP requests, to
// maintain a persisten authentication. In production, only the
// minimal user information (like user id) should be serialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

// TODO:
// Once the user reaches the next HTTP page, the user info is
// deserialized as described here. In production here we must
// check the data base if the deserialized user ID exists and
// return error otherwise.
passport.deserializeUser(function(obj, done){
  done(null, obj);
});

module.exports = passport; 
