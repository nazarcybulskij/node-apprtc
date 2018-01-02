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
    var userId = params.userid ;
    
    console.log('connect '+userId)

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
        
        delete   listOfUsersOffline[userId];
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



    socket.on('message', function(message,userId) {
        
        var userTo = listOfUsers[userId];
        var userFrom = listOfUsers[socket.userid];
        
        if (userFrom!==undefined){
            
            if (userTo===undefined){
                userFrom.socket.emit('message_received', message, userId);
                sendCallPush('/topics/'+encodeURIComponent(userId),{
                    user_id:socket.userid,
                    message_id:message
                })

            }else{
                userFrom.socket.emit('message_received', message, userId);
                userTo.socket.emit('message_new', message, socket.userid);
            }
        }
        
        // log('Client said: ', message);
        // // for a real app, would be room-only (not broadcast)
        // socket.broadcast.emit('message', message);
    });




    socket.on('call', function(userId) {

        var userFrom = listOfUsers[socket.userid];
        var userTo = listOfUsers[userId];
        
        if (userFrom!==undefined){
            
            if (userTo===undefined){
                
                userFrom.socket.emit('outgoing-call', userId, socket.id);
                userFrom.otherUserId = userId;
                
                //push  
                
                sendCallPush('/topics/'+encodeURIComponent(userId),{
                    user_id:socket.userid,
                    room_id:socket.id
                })
                userTo = listOfUsersOffline[userId];
                
        
                userTo =  {
                    userid:userTo.userid,
                    otherUserId:socket.userid
                };
          
                

            }else{
                
                userFrom.socket.emit('outgoing-call', userId, socket.id);
                userFrom.otherUserId = userId;
                
                userTo.socket.emit('incoming-call', userId, socket.id);
                userTo.otherUserId = socket.userid;
                
            }
            
        }
        
     
    });


    socket.on('answer-call', function(userId) {
        
        var userFrom = listOfUsers[socket.userid];
        var userTo = listOfUsers[userId];


       
        if (userTo === undefined){
            if (userFrom !== undefined){
                userFrom.socket.emit('answer-call-phone', userId, socket.id);
            }
            console.log('userFrom')
            return;
        }
        
        if (userFrom === undefined){
            if (userTo !== undefined){
                userTo.socket.emit('answer-call-phone', userId, socket.id);
            }
             console.log('userTo')
            return
        }
        
        
         if (userId===socket.userid){
            userFrom.socket.emit('answer-call-phone', userId, socket.id);
            userTo = listOfUsers[userFrom.otherUserId];
            if (userTo !== undefined){
                userTo.socket.emit('answer-call-phone', userId, socket.id);
            }
        }else{
            userFrom.socket.emit('answer-call-phone', userId, socket.id);
            userTo.socket.emit('answer-call-phone', userId, socket.id);
        }
        
       
       
        
    


/*

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
        
   */

    });


    socket.on('hang-up', function(userId) {
        
        console.log(userId +"   "+socket.userid)
        
        var userTo = listOfUsers[userId];
        var userFrom = listOfUsers[socket.userid];
        
        if (userTo === undefined){
            if (userFrom !== undefined){
                userFrom.socket.emit('hang-up-call', userId, socket.userid);
                return
            }
        }
        
        if (userFrom === undefined){
            if (userTo !== undefined){
                userTo.socket.emit('hang-up-call', userId, socket.userid);
                return
            }
        }
        
       if (userId===socket.userid){
             userFrom.socket.emit('hang-up-call', userId, socket.userid);
             userTo = listOfUsers[userFrom.otherUserId];
             if (userTo !== undefined){
                  userTo.socket.emit('hang-up-call', userId, socket.userid);
             }
        }else{
            userFrom.socket.emit('hang-up-call', userId, socket.userid);
            userTo.socket.emit('hang-up-call', userId, socket.userid);
        }
        
    });


    socket.on('get-users-ids', function() {
        var userids =[];
        var currentUser = listOfUsers[socket.userid];
        if (currentUser === undefined){
             socket.emit('users-ids',userids);
            return;
        }

        if (currentUser.userid === undefined){
             socket.emit('users-ids',userids);
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
        
        var deleteuser = listOfUsers[socket.userid];
        listOfUsersOffline[socket.userid] = deleteuser;
        
        console.log('delete '+socket.userid);
        
        delete   listOfUsers[socket.userid];
    });

});

server.start(function() {
    console.log('Server started at ' + server.info.uri + '.');
});


