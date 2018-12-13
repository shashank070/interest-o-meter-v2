var express= require('express')
var path = require('path');
var app = express();
var moment = require('moment');
var bodyParser = require('body-parser')


app.use(express.static(path.join(__dirname, '/dist/pollapp')));
app.use('/admin', express.static(path.join(__dirname, '/dist/admin-page')))
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));
app.use(express.json()); 


app.get('/', function (req, res) {
  console.log('invalid page')
  res.send('invalid page')
})


var sessionsData={}
var server = require('http').Server(app);
const port = 80
server.listen(port);
var io = require('socket.io')(server);


function setTimers( sessionId ){
    let sysDate = moment(new Date()).valueOf();
    let session = sessionsData[sessionId];
    let meetingTime = moment(session.meetingStartDateTime).valueOf()
    let meetingTimePlusFifteen = moment(session.meetingStartDateTime).add(15, 'minutes').add(1,'seconds').valueOf()
    console.log(meetingTime)
    console.log(meetingTimePlusFifteen)

    setTimeout(() => {
        let newSysDate = moment(new Date()).valueOf();
        console.log(newSysDate)
        console.log("Meeting [" + sessionId + "] started")
        var beforeFifteenInterval = setInterval(()=>{
            console.log("Interval log")
            let date = new Date()
            let currentTime =  moment(new Date()).add(8,"hours").valueOf();
            // console.log("sys time in secs" + currentTime)
            sessionsData[sessionId].data.push([currentTime,5]);
            // console.log('data is ' + sessionsData[sessionId].data)
            console.log("Interval emitting on : " + 'showResults'+sessionId)
            
           
        },5000);
        setTimeout(() => {
            console.log("3 Minutes after Meeting [" + sessionId + "] started")
            clearInterval(beforeFifteenInterval)
            sessionsData[sessionId].canVote = true
            var counter = 0
            var aggregationInterval = setInterval(()=>{
            counter++;
            if(counter > 10 )
                {clearInterval(aggregationInterval)
                sessionsData[sessionId].canVote = false;}
            else{
                let date = new Date()
                let currentTime = moment(new Date()).add(8,"hours").valueOf();
                let session = sessionsData[sessionId];
                let outstandingVotes = session.maxVoterCount - session.intervalVotes
                sessionsData[sessionId].totalVotes += outstandingVotes;
                sessionsData[sessionId].totalScore += outstandingVotes * 5;
                let weightedAverage=sessionsData[sessionId].totalScore/sessionsData[sessionId].totalVotes;
                sessionsData[sessionId].data.push([currentTime,weightedAverage]);
                sessionsData[sessionId].intervalVotes = 0;
                sessionsData[sessionId].totalVotes = 0;
                sessionsData[sessionId].totalScore = 0;
            }
            },300000)

        }, meetingTimePlusFifteen - meetingTime  );
    

    }, meetingTime - sysDate );
};







/*  -------------------------ADMIN OPTIONS DO NOT TOUCH-----------------------  */

app.get('/admin', (req, res) => {
    console.log("Hit on Admin page")
    console.log(path.join(__dirname, '/dist/admin-page/index.html'))
    res.sendFile(path.join(__dirname, '/dist/admin-page/index.html'))
});


app.post('/createNewMeeting', (req, res) => {
    let sessionId = req.body.meetingDetails.sessionId.split('/')[1]
    console.log("Post request for creating Session: " + sessionId)
    let meetingDetails = req.body.meetingDetails
    let meetingStartDateTime = moment(meetingDetails.meetingDate).add(meetingDetails.meetingStartHour, 
        'hours').add(meetingDetails.meetingStartMinute, 'minutes');
    let meetingEndDateTime = moment(meetingDetails.meetingDate).add(meetingDetails.meetingEndHour, 
        'hours').add(meetingDetails.meetingEndMinute, 'minutes').valueOf();
    meetingDetails['meetingStartDateTime'] = meetingStartDateTime;
    meetingDetails['meetingEndDateTime'] = meetingEndDateTime;
    meetingDetails['currentVoterCount'] = 0;
    meetingDetails['data'] = []
    meetingDetails['totalScore'] = 0
    meetingDetails['totalVotes'] = 0
    meetingDetails['intervalVotes'] = 0
    meetingDetails['canVote'] = false
    
    sessionsData[sessionId] = meetingDetails;
    console.log('Created new Session: ' + sessionId);
    setTimers(sessionId);
    res.send({success: 'true'})
});





/*  -------------------------------------------------------------------------  */

app.get('/:session', (req, res) => {
    sessionId =  req.params.session;
    console.log("Request for session: "+ sessionId)    
    if(sessionsData.hasOwnProperty(sessionId)){
        session = sessionsData[sessionId];
        // console.log(session)
        // console.log(session.meetingDate)
        let sysDate=moment(new Date()).valueOf()
        if(sysDate<session.meetingStartDateTime)
            res.send('Meet not started yet')
        else
        if( session.currentVoterCount<session.maxVoterCount){ //remove true
            sessionsData[sessionId].currentVoterCount++;    
            console.log("Connection on session id "+sessionId)
            console.log("Current Voter count "+sessionsData[sessionId].currentVoterCount);
            res.sendFile(path.join(__dirname, '/dist/pollapp/index.html'));
        }
        else res.send('Max limit Exceeded')
    }
    else res.send('Invalid Sessionn')
 });

//interestpollingapp/admin-page/dist/admin-page








io.on('connection', function (socket) {
    
    console.log('New Socket Connection Created');

    socket.on('vote/', function(payload){
        console.log("New Vote recieved")
        let sessionId = payload.sessionId
        let score = payload.score
        let session = sessionsData[sessionId]
        let sysDate=moment(new Date()).valueOf() 
        // console.log(session.meetingEndDateTime)
        // console.log(sysDate)
        if(session.meetingEndDateTime>=sysDate){

            session.totalScore=session.totalScore+parseInt(score);
            session.totalVotes+=1;
            session.intervalVotes+=1
            var date=new Date()
            var currentTime=  moment(new Date()).add(8,"hours").valueOf();
            var weightedAverage=session.totalScore/session.totalVotes;
            session.data.push([currentTime,weightedAverage]);
            console.log('Someone voted on sessionId: '+sessionId+ ' Score->'+ score);
            // console.log('Total Score for sessionId: '+sessionId+" is "+session.totalScore);
            io.emit('showResults/'+sessionId, session.data);

        }
       
    });

    var intervalPool = setInterval(()=>{   }, 100000);
    
    socket.on('requestResults/',function(sessionId){
        sessionId = sessionId.sessionId;
        if(sessionsData.hasOwnProperty(sessionId)){
            let session = sessionsData[sessionId]
            let dataObj={}
            dataObj["data"]=session.data;
            dataObj["meetingTitle"]=session.meetingTitle;
            io.emit('showResults/'+sessionId, dataObj);
            clearInterval(intervalPool)
            intervalPool = setInterval(()=>{
                io.emit('showResults/'+sessionId, {"data": session.data, "meetingTitle": session.meetingTitle});
                io.emit('canVote/'+sessionId, session.canVote)
            }, 4000);

        }
    });

    socket.on('canIVote/',function(sessionId){
        sessionId = sessionId.sessionId;
        if(sessionsData.hasOwnProperty(sessionId)){
            let session = sessionsData[sessionId]
            io.emit('canVote/'+sessionId, session.canVote);
        }
    });



});
