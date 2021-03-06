var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var tedious = require('tedious');
var session = require('client-sessions');
var hashing = require('bcrypt');
var mail = require('nodemailer');
var fs = require('fs');
var formidable = require('formidable');
var id3 = require('node-id3');

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
const userStorageLimit = 1e8;

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

//TODO: Clean this shit up
//Also, fuck Node, fuck JavaScript, fuck all this asynchronous bullshit
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
			var token = (parseInt(Math.random() * 1000000000)).toString() + (parseInt(Math.random() * 1000000000)).toString();
			
			var checkToken = new tedious.Request('SELECT * FROM [dbo].[PasswordReset] WHERE [User] = @user', function(err, rowCount, rows) {
				if(err)
					throw err;
				
				if(rowCount > 0) {
					var updateToken = new tedious.Request('UPDATE [dbo].[PasswordReset] SET [Token] = @token, [Expires] = @time WHERE [User] = @user', function(err, rowCount, rows) {
						if(err)
							throw err;
						
						var url = req.headers.host + '/reset/' + token;
						var smtpTransport = mail.createTransport({
							service: 'SendGrid',
							auth: {
								user: process.env.MAIL_AUTH_USER,
								pass: process.env.MAIL_AUTH_PW
							}
						});
						
						var mailOptions = {
							to: req.body.email,
							from: 'passwordreset@flockit.com',
							subject: 'Flock It Password Reset',
							text: 'Hello ' + username.trim() + ',\nPlease follow this link to reset your Flock It password: ' + url
						};
						
						console.log("hi1");
						smtpTransport.sendMail(mailOptions, function(err) {
							if(err)
								throw err;
							
							console.log("hi2");
							ret.msg = 'Check ' + req.body.email + ' to reset your password. The reset link expires in 30 minutes';
							console.log("hi3");
							res.json(ret);
							console.log('hi4');
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
							service: 'SendGrid',
							auth: {
								user: process.env.MAIL_AUTH_USER,
								pass: process.env.MAIL_AUTH_PW
							}
						});
						
						var mailOptions = {
							to: req.body.email,
							from: 'passwordreset@flockit.com',
							subject: 'Flock It Password Reset',
							text: 'Hello ' + username.trim() + ',\nPlease follow this link to reset your Flock It password: ' + url
						};
						
						console.log("hi1");
						smtpTransport.sendMail(mailOptions, function(err) {
							if(err)
								throw err;
							
							console.log("hi2");
							ret.msg = 'Check ' + req.body.email + ' to reset your password. The reset link expires in 30 minutes';
							console.log("hi3");
							res.json(ret);
							console.log('hi4');
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

app.get('/reset/:token', function(req, res) {
	var TYPES = tedious.TYPES;
	var checkToken = new tedious.Request('SELECT [User], [Expires] FROM [dbo].[PasswordReset] WHERE [Token] = @token', function(err, rowCount, rows) {
		if(err)
			throw err;
		
		if(rowCount !== 1) {
			console.log("uh oh...");
			return;
		}
		
		var user = rows[0][0].value;
		var expires = rows[0][1].value;
		
		console.log(user);
		
		if(new Date(expires) < Date.now()) {
			var data = "This password reset token has expired. Please reset your password again.";
			res.writeHead(200, {'Content-Type': 'text/html','Content-Length':data.length});
			res.write(data);
			res.end();
		} else {
			var getUsername = new tedious.Request('SELECT [Username] FROM [dbo].[User] WHERE [Id] = @user', function(err, rowCount, rows) {
				if(err)
					throw err;
				
				if(rowCount !== 1) {
					console.log("uh oh...");
					return;
				}
				
				var username = rows[0][0].value;
				fs.readFile('resetPass2.html',function (err, data) {
					if(err)
						throw err;
					
					data = data.toString().replace('[INSERT USERNAME HERE]', rows[0][0].value);
					res.writeHead(200, {'Content-Type': 'text/html','Content-Length':data.length});
					res.write(data);
					res.end();
				});
			});
			
			getUsername.addParameter('user', TYPES.Int, user);
			connection.execSql(getUsername);
		}
	});
	
	checkToken.addParameter('token', TYPES.VarChar, req.params.token);
	connection.execSql(checkToken);
});

app.post('/resetPassword', function(req, res) {
	var update = new tedious.Request('UPDATE [dbo].[User] SET PasswordHash = @hash WHERE Username = @user', function(err, rowCount, rows) {
		if(err)
			throw err;
		
		res.json({});
	});
	
	var TYPES = tedious.TYPES;
	update.addParameter('user', TYPES.VarChar, req.body.username);
	update.addParameter('hash', TYPES.VarChar, hashing.hashSync(req.body.password, saltRounds));
	connection.execSql(update);
});

app.get('/upload', function(req, res) {
	if(!req.session.user)
		res.sendFile(__dirname + '/index.html');
	else
		res.sendFile(__dirname + '/upload.html');
});

app.post('/upload', function(req, res) {
	if(!req.session.user)
		return;
	
	console.log("wtf");
	
	try {
		fs.accessSync(path.join(__dirname, 'uploads'));
	} catch(e) {
		fs.mkdirSync(path.join(__dirname, 'uploads'));
	}
	
	try {
		fs.accessSync(path.join(__dirname, 'uploads', req.session.user.toString()));
	} catch(e) {
		fs.mkdirSync(path.join(__dirname, 'uploads', req.session.user.toString()));
	}
	
	var mp3 = parseInt(1000000 * Math.random()).toString() + '.mp3';
	var newPath = path.join(__dirname, 'uploads', req.session.user.toString(), mp3);
	var form = new formidable.IncomingForm();
	
	form.parse(req, function(err, fields, files) {
		console.log(JSON.stringify(fields));
		console.log(JSON.stringify(files));
		
		var title = fields.title;
		var artist = fields.artist;
		var album = fields.album;
		var audio = files.audioFile;
		
		var TYPES = tedious.TYPES;
		var checkUploadSize = new tedious.Request('SELECT SUM(FileSize) FROM [dbo].[Song] WHERE Owner = @owner', function(err, rowCount, rows) {
			if(err)
				throw err;
			
			var totalSize = rows[0][0].value;
			
			if(parseInt(totalSize) + audio.size > userStorageLimit) {
				res.json({err: 'Uploading this file would exceed your storage limit'});
				return;
			}
			
			var logAudio = new tedious.Request('INSERT INTO [dbo].[Song] ([Url], [Owner], [Source], [Title], [Artist], [Album], [FileSize]) VALUES(@url, @owner, \'Azure\', @title, @artist, @album, @size)', function(err, rowCount, rows) {
				if(err)
					throw err;
				
				res.json({err: null});
			});
			logAudio.addParameter('owner', TYPES.Int, req.session.user);
			logAudio.addParameter('url', TYPES.VarChar, 'http://flockit-login.azurewebsites.net/uploads/' + req.session.user.toString() + '/' + mp3);
			logAudio.addParameter('title', TYPES.VarChar, title);
			logAudio.addParameter('artist', TYPES.VarChar, artist);
			logAudio.addParameter('album', TYPES.VarChar, album);
			logAudio.addParameter('size', TYPES.Int, audio.size);
			connection.execSql(logAudio);
		});
		
		checkUploadSize.addParameter('owner', TYPES.Int, req.session.user);
		connection.execSql(checkUploadSize);
	});
	
	form.on('fileBegin', function(name, file) {
		file.path = newPath;
	});
});

app.get('/uploadedFiles', function(req, res) {
	var tracks = [];
	if(!req.session.user) {
		res.json(tracks);
		return;
	}
	
	var uploaded = new tedious.Request('SELECT * FROM [dbo].[Song] WHERE [Owner] = @owner AND [Source] = \'Azure\'', function(err, rowCount, rows) {
		if(err)
			throw err;
		
		for(var i = 0; i < rowCount; i++) {
			tracks.push({url: rows[i][1].value, title: rows[i][4].value.trim(), artist: rows[i][5].value.trim(), album: rows[i][6].value.trim()});
		}
		console.log(JSON.stringify(tracks));
		res.json(tracks);
	});
	
	uploaded.addParameter('owner', tedious.TYPES.Int, req.session.user);
	connection.execSql(uploaded);
});

app.post('/getTrackData', function(req, res) {
	var form = new formidable.IncomingForm();
	
	form.parse(req, function(err, fields, files) {
		if(err)
			throw err;
		
		var tags = id3.read(files.audioFile.path);
		res.json({err: null, title: tags.title, artist: tags.artist, album: tags.album});
	});
});

var port = process.env.PORT || 1337;
app.listen(port);