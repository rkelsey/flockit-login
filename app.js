var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var tedious = require('tedious');
var session = require('client-sessions');
var hashing = require('bcrypt');
var mail = require('nodemailer');

var app = express();
var dbConfig = {
	userName: process.env.DB_ADMIN,
	password: process.env.DB_PW,
	server: process.env.DB_SERVER,
	options: {
		database: process.env.DB_NAME,
		encrypt: true,
		rowCollectionOnRequestCompletion: true
	}
}

var connection = new tedious.Connection(dbConfig);
connection.on('connect', function(err) {
	if(err) {
		console.log(err);
		return;
	}
});

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(__dirname));
app.use(session({
	cookieName: 'session',
	secret: Math.random().toString(),
	duration: 2147483647,
	activeDuration: 2147483647
}));

const saltRounds = 10;

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});

app.post('/test', function(req, res) {
	//var connection = new tedious.Connection(dbConfig);
	var request = new tedious.Request('SELECT * FROM [dbo].[User]', function(err, rowCount, rows) {
		console.log(rows);
		res.json(rows[0][0].value);
	});
	
	connection.execSql(request);
});

app.get('/signup', function(req, res) {
	res.sendFile(__dirname + '/signup.html');
});

app.get('/login', function(req, res) {
	res.sendFile(__dirname + '/login.html');
});

app.get('/forgotPassword', function(req, res) {
	res.sendFile(__dirname + '/resetPass.html');
});

app.post('/signup', function(req, res) {
	console.log(JSON.stringify(req.body));
	var ret = {};
	ret.error = null;
	
	var TYPES = tedious.TYPES;
	
	var checkUsername = new tedious.Request('SELECT * FROM [dbo].[User] WHERE username = @user', function(err, rowCount, rows) {
		if(err)
			throw err;
		
		if(rowCount > 0) {
			ret.err = 'That username is already taken.';
			res.json(ret);
			return;
		} else {
			var checkEmail = new tedious.Request('SELECT * FROM [dbo].[User] WHERE email = @email', function(err, rowCount, rows) {
				if(err)
					throw err;
				
				if(rowCount > 0) {
					ret.err = 'That email is already being used.';
					res.json(ret);
					return;
				} else {
					var insert = new tedious.Request('INSERT INTO [dbo].[User] (Username, PasswordHash, Email, FirstName, LastName) VALUES (@user, @pass, @email, @first, @last)', function(err, rows, rowCount) {
						if(err)
							throw err;
						
						res.json(ret);
					});
					
					insert.addParameter('user', TYPES.VarChar, req.body.username);
					insert.addParameter('pass', TYPES.VarChar, hashing.hashSync(req.body.password, saltRounds));
					insert.addParameter('email', TYPES.VarChar, req.body.email);
					insert.addParameter('first', TYPES.VarChar, req.body.first);
					insert.addParameter('last', TYPES.VarChar, req.body.last);
					connection.execSql(insert);
				}
			});
			
			checkEmail.addParameter('email', TYPES.VarChar, req.body.email);
			connection.execSql(checkEmail);
		}
	});
	
	checkUsername.addParameter('user', TYPES.VarChar, req.body.username);
	connection.execSql(checkUsername);
});

app.post('/login', function(req, res) {
	console.log(req.session.user);
	var TYPES = tedious.TYPES;
	
	var checkExists = new tedious.Request('SELECT Id, PasswordHash FROM [dbo].[User] WHERE username = @user', function(err, rowCount, rows) {
		if(err)
			throw err;
		
		if(rowCount !== 1) {
			res.json({err: 'Invalid username'});
		} else {
			var hashedPass = rows[0][1].value;
			if(!hashing.compareSync(req.body.password, hashedPass)) {
				res.json({err: 'Invalid password'});
				return;
			}
			req.session.user = rows[0][0].value;
			res.json({err: null});
		}
	});
	
	checkExists.addParameter('user', TYPES.VarChar, req.body.username);
	connection.execSql(checkExists);
});

app.post('/forgotPassword', function(req, res) {
	var ret = {};
	ret.error = null;
	
	var TYPES = tedious.TYPES;
	
	var checkEmail = new tedious.Request('SELECT Id, Username FROM [dbo].[User] WHERE [Email] = @email', function(err, rowCount, rows) {
		if(err)
			throw err;
		
		if(rowCount !== 1) {
			res.json({err: 'That email is not registered.'});
		} else {
			var user = rows[0][0].value;
			var username = rows[0][1].value;
			var token = hashing.hashSync(Math.random().toString(), saltRounds);
			
			var checkToken = new tedious.Request('SELECT * FROM [dbo].[PasswordReset] WHERE [User] = @user', function(err, rowCount, rows) {
				if(err)
					throw err;
				
				if(rowCount > 0) {
					var updateToken = new tedious.Request('UPDATE [dbo].[PasswordReset] SET [Token] = @token, [Expires] = @time WHERE [User] = @user', function(err, rowCount, rows) {
						if(err)
							throw err;
						
						var url = req.headers.host + '/reset/' + token;
						var smtpTransport = mail.createTransport({
							service: 'Gmail',
							auth: {
								user: 'ryan.kelsey01@gmail.com',
								pass: 'no'
							}
						});
						
						var mailOptions = {
							to: req.body.email,
							from: 'passwordreset@flockit.com',
							subject: 'Flock It Password Reset',
							text: 'Hello ' + username + ',\nPlease follow this link to reset your Flock It password: ' + url
						};
						
						console.log("hi");
						smtpTransport.sendMail(mailOptions, function(err) {
							if(err)
								throw err;
							
							console.log("hi");
							ret.msg = 'Check ' + email + ' to reset your password. The reset link expires in 30 minutes';
							res.json(ret);
							console.log('hi');
						});
					});
					
					updateToken.addParameter('token', TYPES.VarChar, token);
					updateToken.addParameter('time', TYPES.DateTime, new Date(Date.now() + 1800000)); //30 minutes
					updateToken.addParameter('user', TYPES.Int, user);
					connection.execSql(updateToken);
				} else {
					var insertToken = new tedious.Request('INSERT INTO [dbo].[PasswordReset] VALUES(@token, @time, @user)', function(err, rowCount, rows) {
						if(err)
							throw err;
						
						var url = req.headers.host + '/reset/' + token;
						var smtpTransport = mail.createTransport({
							service: 'Gmail',
							auth: {
								user: 'ryan.kelsey01@gmail.com',
								pass: 'no'
							}
						});
						
						var mailOptions = {
							to: req.body.email,
							from: 'passwordreset@flockit.com',
							subject: 'Flock It Password Reset',
							text: 'Hello ' + username + ',\nPlease follow this link to reset your Flock It password: ' + url
						};
						
						smtpTransport.sendMail(mailOptions, function(err) {
							if(err)
								throw err;
							
							ret.msg = 'Check ' + email + ' to reset your password. The reset link expires in 30 minutes';
							res.json(ret);
						});
					});
					
					insertToken.addParameter('token', TYPES.VarChar, token);
					insertToken.addParameter('time', TYPES.DateTime, new Date(Date.now() + 1800000)); //30 minutes
					insertToken.addParameter('user', TYPES.Int, user);
					connection.execSql(insertToken);
				}
			});
			
			checkToken.addParameter('user', TYPES.VarChar, user);
			connection.execSql(checkToken);
		}
	});
	
	checkEmail.addParameter('email', TYPES.VarChar, req.body.email);
	console.log('okay');
	connection.execSql(checkEmail);
});

var port = process.env.PORT || 1337;
app.listen(port);