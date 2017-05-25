var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var sql = require('mssql');

var app = express();

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
	pool = new sql.ConnectionPool({
		user: 'ryan',
		password: 'cop4935l!t',
		server: 'tcp:flockit.database.windows.net',
		database: 'flockit'
	});

	pool.connect(function(err) {
		console.log(err + ' Couldn\'t connect!');
	});

	request = new sql.Request(pool);
	request.query('select 1 as number', function(err, result) {
		console.log(result.recordset[0].number);
	});

	pool.close();

	res.json({});
});

var port = process.env.PORT || 1337;
app.listen(port);
