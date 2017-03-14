// This is the stuff that listens to the FoosBot Node app

var socket = io.connect('http://localhost:8000');

socket.on('message', function(data){
    console.log('Hey, I got a message from FoosBot: ' + data);
    playSound('attack');
});