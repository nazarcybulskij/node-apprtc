var Hapi = require('hapi');
var Route = require('./route');
var Config = require('./config');


var app = {};
app.config = Config;

var server = new Hapi.Server();

server.connection({ routes: { cors: true }, port: app.config.server.port });

server.register(require('inert'));
server.register(require('vision'), function (error) {
  if (error) {
    console.log('Failed to load vision.');
  }
});

server.route(Route.endpoints);

server.views({
  engines: {
    html: require('handlebars')
  },
  relativeTo: __dirname,
  path: './view'
});


//  push

var gcm = require("node-gcm");
var serverKey = 'AAAA3fD-75k:APA91bHOMdz83r9-dPmmp2rAhyHtpQu87EQx7xxKs2EPxLsM1Cc3GJSTc_un9MUnecGHgSSglIJiqj7XP_UZglOrORENBWgOqco6JogIlpyOzKiFpUgOWz0yiAm4Offf3CTZyLb-YZwb'; //put your server key here
var sender = gcm.Sender(serverKey)

//

//IO_Sockets
var io = require('socket.io')(server.listener);

var listOfUsers = {};

var listOfUsersOffline = {};


io.on('connection', function(socket) {

    var params = socket.handshake.query;
    var sessionid = params.sessionid;
    //var socketMessageEvent = params.msgEvent || '';
    var userId = params.userid ;

    appendUser(socket);

    // convenience function to log server messages on the client
    function log() {
        var array = ['Message from server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }


    //append  user
    function appendUser(socket) {

        var params = socket.handshake.query;
        var sessionId = params.sessionid;
        var userId = params.userid;

        listOfUsers[userId] = {
            socket: socket,
            userid:userId,
            sesionId:sessionId
        };
        socket.userid = userId;
    }

    function sendCallPush(topic,messagedata){
        var message = gcm.Message({
            data:messagedata
        })

        sender.sendNoRetry(message, { to: topic }, function(err, response){
            if (err) {
                console.log("Something has gone wrong!");
            } else {
                console.log("Successfully sent with response: ", response);
            }
        });

    }



    socket.on('message', function(message) {
        log('Client said: ', message);
        // for a real app, would be room-only (not broadcast)
        socket.broadcast.emit('message', message);
    });

    //sendCallPush('/topics/nazarko%40gmail.com')



    socket.on('call', function(userId) {

        var userTo = listOfUsers[userId];

        var userFrom = listOfUsers[socket.userid];

        if (userTo == undefined) {
            //socket.leaveAll()
            userFrom.socket.emit('outgoing-call', userId, socket.id);
            sendCallPush('/topics/'+encodeURIComponent(userId),{
                user_id:userId,
                room_id:socket.id

            })

            userFrom.otherUserId = userId;

            listOfUsersOffline[userId]={
                otherUserId:socket.userid
            }

            // userTo.otherUserId = socket.userid;
            // userTo = listOfUsersOffline[userId]
            // userTo.otherUserId = socket.userid
            //userTo.otherUserId = socket.userid;

        } else{
            // socket.join(userId);
            userFrom.socket.emit('outgoing-call', userId, socket.id);
            userTo.socket.emit('incoming-call', userId, socket.id);
            userFrom.otherUserId = userId;
            userTo.otherUserId = socket.userid;
        }
    });


    socket.on('answer-call', function(userId) {

        var userTo = listOfUsers[userId];
        var userFrom = listOfUsers[socket.userid];

        // if (userTo == undefined) {
        //     socket.leaveAll()
        //     userFrom.socket.emit('answer-call-phone', userId, socket.id);
        //     return;
        // } else{

        if (userFrom === userTo){
            userTo.socket.emit('answer-call-phone', userId, socket.id);

            userFrom = listOfUsers[userTo.otherUserId];
            if  (userFrom !== undefined){
                userFrom.socket.emit('answer-call-phone', userId, socket.id);
            }else{
                userFrom = listOfUsers[listOfUsersOffline[userId].otherUserId];
                userFrom.socket.emit('answer-call-phone', userId, socket.id);
            };

        }else{
            socket.emit('answer-call-phone', userId, socket.id);
            userTo.socket.emit('answer-call-phone', userId, socket.id);
        }
        // }

    });


    socket.on('hang-up', function(userId) {
        var userTo = listOfUsers[userId];
        var userFrom = listOfUsers[socket.userid];

        // if (userTo == undefined) {
        //     socket.leaveAll()
        //     userFrom.socket.emit('hang-up-call', userId, socket.id);
        //     return;
        // } else{

        if (userFrom === userTo){
            userTo.socket.emit('hang-up-call', userId, socket.id);
            userFrom = listOfUsers[userTo.otherUserId];
            if  (userFrom !== undefined){
                userFrom.socket.emit('hang-up-call', userId, socket.id);
            }else{
                userFrom = listOfUsers[listOfUsersOffline[userId].otherUserId];
                userFrom.socket.emit('hang-up-call', userId, socket.id);
            }
        }else{
            socket.emit('hang-up-call', userId, socket.id);
            userTo.socket.emit('hang-up-call', userId, socket.id);
        }
        // }
    });


    socket.on('get-users-ids', function() {
        var userids =[];
        var currentUser = listOfUsers[socket.userid];
        if (currentUser === undefined){
            return;
        }

        if (currentUser.userid === undefined){
            return;
        }

        for (var user in listOfUsers)
            if(currentUser.userid !== user)
                userids.push(user)
        socket.emit('users-ids',userids);
    });

    socket.on('ipaddr', function() {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function(details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

    socket.on('bye', function(){
        console.log('received bye');
    });

    socket.on('disconnect', function() {
        console.log('Got disconnect!');
        //var disconectedUser = listOfUsers[socket.userid];
        // var user =  listOfUsers[socket.userid];


        //  listOfUsersOffline[socket.userid] = {
        //     userid:socket.userid
        // };

        delete   listOfUsers[socket.userid];
    });

});

server.start(function() {
    console.log('Server started at ' + server.info.uri + '.');
});


