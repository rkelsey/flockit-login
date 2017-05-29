var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var tedious = require('tedious');

var app = express();
var dbConfig = {
	userName: 'ryan',
	password: 'cop4935l!t',
	server: 'flockit.database.windows.net',
	options: {
		database: 'flockit',
		encrypt: true,
		rowCollectionOnRequestCompletion: true
	}
}

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(__dirname));

app.get('/', function(req, res) {
	res.sendFile('index.html');
});

app.post('/test', function(req, res) {
	var connection = new tedious.Connection(dbConfig);
	var request = new tedious.Request('SELECT * FROM [dbo].[User]', function(err, rowCount, rows) {
		console.log(rows);
		res.json(rows[0][0].value);
	});
	
	connection.on('connect', function(err) {
		if(err) {
			console.log(err);
			res.json({});
		} else {
			connection.execSql(request);
		}
	});
});

var port = process.env.PORT || 1337;
app.listen(port);
