var createError = require('http-errors');
var path, node_ssh, ssh, fs;
fs = require('fs');
path = require('path');
node_ssh = require('node-ssh');
ssh = new node_ssh();
var express = require('express');
// var path = require('path');
var logger = require('morgan');
var models = require('./models');
var cookieParser = require('cookie-parser');
var passport = require('passport');
require('./config/passport');
var bodyParser = require('body-parser')

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var messengerRouter = require('./routes/messenger');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(bodyParser.json({ limit: '5mb' }))
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, OPTIONS');
    next();
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'client/dist')));


app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/messenger', messengerRouter);

models.sequelize.sync().then(function() {
    console.log("DB Sync'd up");
});
// the method that starts the deployment process
function main() {
    console.log('Deployment started.');
    sshConnect();
  }
  
  // installs PM2
  function installPM2() {
    return ssh.execCommand(
      'sudo npm install pm2 -g', {
        cwd: '/home/ubuntu'
    });
  }
  
  // transfers local project to the remote server
  function transferProjectToRemote(failed, successful) {
    return ssh.putDirectory(
      '../racket-redone',
      '/home/ubuntu/racket-redone-temp',
      {
        recursive: true,
        concurrency: 1,
        validate: function(itemPath) {
          const baseName = path.basename(itemPath);
          return (
            baseName.substr(0, 1) !== '.' && baseName !== 'node_modules' // do not allow dot files
          ); // do not allow node_modules
        },
        tick: function(localPath, remotePath, error) {
          if (error) {
            failed.push(localPath);
            console.log('failed.push: ' + localPath);
          } else {
            successful.push(localPath);
            console.log('successful.push: ' + localPath);
          }
        }
      }
    );
  }
  
  // creates a temporary folder on the remote server
  function createRemoteTempFolder() {
    return ssh.execCommand(
      'rm -rf racket-redone-temp && mkdir racket-redone-temp', {
        cwd: '/home/ubuntu'
    });
  }
  
  // stops mongodb and node services on the remote server
  function stopRemoteServices() {
    return ssh.execCommand(
      'pm2 stop all && sudo service npm stop', {
        cwd: '/home/ubuntu'
    });
  }
  
  // updates the project source on the server
  function updateRemoteApp() {
    return ssh.execCommand(
      'cp -r racket-redone-temp/* racket-redone/ && rm -rf racket-redone-temp', {
        cwd: '/home/ubuntu'
    });
  }
  
  // restart mongodb and node services on the remote server
  function restartRemoteServices() {
    return ssh.execCommand(
      'cd hackathon-starter && sudo service npm start && pm2 start app.js', {
        cwd: '/home/ubuntu'
    });
  }
  
  // connect to the remote server
  function sshConnect() {
    console.log('Connecting to the server...');
  
    ssh
      .connect({
        // TODO: ADD YOUR IP ADDRESS BELOW (e.g. '12.34.5.67')
        host: '3.88.192.236',
        username: 'ubuntu',
        privateKey: 'racket-redone-key.pem'
      })
      .then(function() {
        console.log('SSH Connection established.');
        console.log('Installing PM2...');
        return installPM2();
      })
      .then(function() {
        console.log('Creating `racket-redone-temp` folder.');
        return createRemoteTempFolder();
      })
      .then(function(result) {
        const failed = [];
        const successful = [];
        if (result.stdout) {
          console.log('STDOUT: ' + result.stdout);
        }
        if (result.stderr) {
          console.log('STDERR: ' + result.stderr);
          return Promise.reject(result.stderr);
        }
        console.log('Transferring files to remote server...');
        return transferProjectToRemote(failed, successful);
      })
      .then(function(status) {
        if (status) {
          console.log('Stopping remote services.');
          return stopRemoteServices();
        } else {
          return Promise.reject(failed.join(', '));
        }
      })
      .then(function(status) {
        if (status) {
          console.log('Updating remote app.');
          return updateRemoteApp();
        } else {
          return Promise.reject(failed.join(', '));
        }
      })
      .then(function(status) {
        if (status) {
          console.log('Restarting remote services...');
          return restartRemoteServices();
        } else {
          return Promise.reject(failed.join(', '));
        }
      })
      .then(function() {
        console.log('DEPLOYMENT COMPLETE!');
        process.exit(0);
      })
      .catch(e => {
        console.error(e);
        process.exit(1);
      });
  }
  
  main();
module.exports = app;
