
var windowSize = { width: 920, height: 670 };
var RSC_Connectivity_H = new RSC_Connectivity_H_client(); //defines values used in rsc communication spec
var RFID_App_H = new RFID_App_H_client(); //defines values used in rsc communication spec
var Config_H = new Config_H_client(); //defines values used in rsc communication spec
var socket; //connects to local webserver in window.onload()
var door = new Door(); //the door we're talking to
var pets = new Array(); //array containing all pets in the door
var requestAllPetsAfterWeKnowNumber = true; //on connect we poll for # of pets in door. if this flag is set, we'll request all pet data as soon as we get a pet count
var checkConnectionTmr = null; //timer. on tick, we send a power query, and we check if we received a response to our previous query (if not, the device must have disconnected)
var receivedSinceLastCheck = false; //Starts false. Set true when message received. Checked & reset to false in checkConnection_Tick() to ensure we're still connected.
var prevAccessModeSelection = 1; //previously selected access mode. jump back to it if "timer" mode selected, but user cancels out of the editor popup for it
var prevPetSelection = 0; //last pet that was selected. so we can jump back to it if user changes pet selection and chooses "cancel" when prompted about unsaved changes
var learnPetTimeout = null; //timeout handle. used when we begin to learn a pet, to know how long to wait until giving up
var learnPetRemainingTime = 30; //seconds
var doorName = "Passport"; //name of door, set in wizard, stored in settings file

window.onload = function () {
    initFields();
};

window.onbeforeunload = function () { //when closing or navigating away from the page
    socket.onclose = function () { }; // disable onclose handler first
    try {
        socket.close(); //shut down connection to server
    }
    catch(err){}
};

addEventListener('app-msg', parseEvent);

function showAlert(text) {
    //using jquery alerts because appjs/chromium on osx doesn't currently support alert/confirm (wtf!)
	$("#alertText").html(text);
	$( "#dialog-alert" ).dialog("open");
}

/*-----------------communication-----------------*/
function RSC_COMM() {
    this.byte_ucDataType = RSC_Connectivity_H.RSCCOMM; ;
    this.byte_ucDistFlags = 0; //This can be left as 0
    this.byte_ucDomain = RSC_Connectivity_H.HEAVY; ;
    this.uint16_wSourceId = RSC_Connectivity_H.CLOUD_OR_APP_ADDRESS;   //my address, to be sent to...
    this.uint16_wDestinationId = RSC_Connectivity_H.DEFAULT_DEVICE_ID; //...the device's address
    this.byte_ucBlockType = RSC_Connectivity_H.HEAVY_PARAM_COMMAND;
    this.byte_bMultiBlockCommand = RSC_Connectivity_H.FALSE;
    this.byte_bLastBlock = RSC_Connectivity_H.TRUE;
    this.byte_ucBlockFlags = RSC_Connectivity_H.RX_ALWAYS; ; //in "set" commands, you must also OR in RSC_Connectivity_H.ACK_NACK_EXPECTED
    this.WDATA = new Array();   //this is different for every message, so must set it when creating
    for (var i = 0; i < 18; i++) {
        this.WDATA[i] = 0;
    } this.WDATA[0] = RSC_Connectivity_H.DEFAULT_DEVICE_ID; //the first field is always the destination ID
    this.byte_ucBlockOnesCnt = 0;   //Rick says i don't need this for usb comms, but may later when sending to the cloud
    this.uint16_iRSSI = 0;          //This is related to RF transmissions and can be left 0 for usb/network comms
    this.byte_ucBlockBitErrors = 0; //^^
    this.byte_ucBlockCWErrors = 0;  //^^

    //---------functions-------------------
    this.toString = function toString() {
        var rsc_comm_str = "------------RSC_COMM---------------<BR/>";
        rsc_comm_str += "ucDataType = " + this.byte_ucDataType + "<BR/>";
        rsc_comm_str += "ucDistFlags = " + this.byte_ucDistFlags + "<BR/>";
        rsc_comm_str += "ucDomain = " + this.byte_ucDomain + "<BR/>";
        rsc_comm_str += "wSourceId = " + this.uint16_wSourceId + "<BR/>";
        rsc_comm_str += "wDestinationId = " + this.uint16_wDestinationId + "<BR/>";
        rsc_comm_str += "ucBlockType = " + this.byte_ucBlockType + "<BR/>";
        rsc_comm_str += "bMultiblockCommand = " + this.byte_bMultiBlockCommand + "<BR/>";
        rsc_comm_str += "bLastBlock = " + this.byte_bLastBlock + "<BR/>";
        rsc_comm_str += "ucBlockFlags = " + this.byte_ucBlockFlags + "<BR/>";
        for (var i = 0; i < 18; i++) {
            if (typeof this.WDATA[i] === 'undefined') {
                rsc_comm_str += "WDATA[" + i + "] is undefined!<BR\>";
            }
            else if (this.WDATA[i] != 0) rsc_comm_str += "WDATA[" + i + "] = 0x" + this.WDATA[i].toString(16) + "<BR/>";
        }
        rsc_comm_str += "ucBlockOnesCnt = " + this.byte_ucBlockOnesCnt + "<BR/>";
        rsc_comm_str += "iRSSI = " + this.uint16_iRSSI + "<BR/>";
        rsc_comm_str += "ucBlockBitErrors = " + this.byte_ucBlockBitErrors + "<BR/>";
        rsc_comm_str += "ucBlockCWErrors = " + this.byte_ucBlockCWErrors + "<BR/>";
        rsc_comm_str += "-----------------------------------";
        return rsc_comm_str;
    }

    this.fillFromJSON = function fillFromJSON(json) {
        var rsc_comm = jQuery.parseJSON(json);
        this.byte_ucDataType = rsc_comm.byte_ucDataType;
        this.byte_ucDistFlags = rsc_comm.byte_ucDistFlags;
        this.byte_ucDomain = rsc_comm.byte_ucDomain;
        this.uint16_wSourceId = rsc_comm.uint16_wSourceId;
        this.uint16_wDestinationId = rsc_comm.uint16_wDestinationId;
        this.byte_ucBlockType = rsc_comm.byte_ucBlockType;
        this.byte_bMultiBlockCommand = rsc_comm.byte_bMultiBlockCommand;
        this.byte_bLastBlock = rsc_comm.byte_bLastBlock;
        this.byte_ucBlockFlags = rsc_comm.byte_ucBlockFlags;
        this.WDATA = rsc_comm.WDATA;
        this.byte_ucBlockOnesCnt = rsc_comm.byte_ucBlockOnesCnt;
        this.uint16_iRSSI = rsc_comm.uint16_iRSSI;
        this.byte_ucBlockBitErrors = rsc_comm.byte_ucBlockBitErrors;
        this.byte_ucBlockCWErrors = rsc_comm.byte_ucBlockCWErrors;
    }
}

function parse(rsc_comm) {
    receivedSinceLastCheck = true;
    if (rsc_comm.byte_ucBlockType == RSC_Connectivity_H.HEAVY_ACK_NACK) {//is it an ACK or NACK?
        if (rsc_comm.WDATA[4] == RSC_Connectivity_H.TRUE) console.log("ACK");
        else if (rsc_comm.WDATA[4] == RSC_Connectivity_H.FALSE) console.error("NACK");
        else console.error("Malformed ACK/NACK packet received.");
    }
    else { //it must be a normal RSC_COMM message
        parse_RSC_COMM(rsc_comm);
    }
}

function parseEvent(e) {
    if (e.isValid === undefined) return;
    console.log("Parsing command: " + e.command);

    if (e.command == 'app-ready') {
        //console.log("Received app version: " + e.data);
        //document.getElementById('appVersion').innerHTML = e.data;
        requestConnectToDoor();
        sendEventToServer("getSettingsValue", {name: "DoorName"} );
        //showStep_setLanguage();
    }
    else if (e.command == 'appVersion') {
        console.log("appVersion? " + e.data);
    }
    else if (e.command == 'deviceConnectionFailed') {
       // deviceDisconnected();
    }
    else if (e.command == 'deviceConnectionEstablished') {
        console.log("Device connection established.");
        var element = document.getElementById('usbIndicator');
        if (element.src != "/apps/PASSport/img/passport_UIUX_USB_ON.png") element.src = "/apps/PASSport/img/passport_UIUX_USB_ON.png";
        showStep_setLanguage();
        //showStep_setName();
        window.setTimeout(initializeFromDevice, 500); //needed a slight delay or message never got through    
        checkConnectionTmr = window.setInterval(checkConnection_Tick, 3000); //every few seconds, send a power request (to make sure we're still connected)
    }
    else if (e.command == 'serialEvent') {
        var rsc_comm = new RSC_COMM();
        rsc_comm.fillFromJSON(e.data);
        parse(rsc_comm);
    }
    else if (e.command == 'settingsNameValuePair') {
        console.error("test: " + e.data.name + "/" + e.data.value);
        if(e.data.name == 'DoorName') {
            document.getElementById("tbDoorName").value = doorName = e.data.value;
            updateLcdText();
        }
    }
    else {
        console.log("got unknown command! cmd:" + e.command);
    }
}

function requestConnectToDoor() {
    console.log("Requesting connectToDevice.");
    var deviceList = new Array();
    deviceList[0] = { vid: "2328", pid: "03ed", type: "serialport"} //door
    //deviceList[1] = { vid: "2328", pid: "0FFF", type: "hid"} //door bootloader
    var eventData = {
        deviceList: deviceList
    }
    sendEventToServer('connectByVidPid', eventData);
}


function sendEventToServer(eventName, customData) {
    console.log('sendEventToServer()');
    var myEvent = new window.Event("server-msg");
    myEvent.isValid = true;
    myEvent.command = eventName;
    myEvent.data = customData;
    console.log("dispatching event: " + eventName);
    window.dispatchEvent(myEvent);
}

function sendToDevice(rsc_comm) {
    console.log("sendToDevice");
    var msgObj = {
        type: "serialport",
        msg: JSON.stringify(rsc_comm)
    }
    sendEventToServer('sendToDevice', msgObj);
}

function getMsgTypeName(rsc_comm) {
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_ADD_INDIVIDUAL_PET) return "PPD_ADD_INDIVIDUAL_PET";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_DELETE_INDIVIDUAL_PET) return "PPD_DELETE_INDIVIDUAL_PET";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_ACTIVITY_LOG) return "PPD_ACTIVITY_LOG";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.QUERY) return "QUERY";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_MODE_CHANGE) return "PPD_MODE_CHANGE";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_MASTER_PET_SETTING) return "PPD_MASTER_PET_SETTING";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_INDIVIDUAL_PET_SETTING) return "PPD_INDIVIDUAL_PET_SETTING";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_INDIVIDUAL_PET_NAME) return "PPD_INDIVIDUAL_PET_NAME";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.DEV_RFID) return "DEV_RFID";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.POWER_SOURCE_QUERY) return "POWER_SOURCE_QUERY";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.DIAGNOSTIC) return "DIAGNOSTIC";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.SCREEN_DUMP) return "SCREEN_DUMP";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.BOOTLOADER) return "BOOTLOADER";
    if (rsc_comm.WDATA[2] == RSC_Connectivity_H.PPD_TM_GEN_TONE) return "PPD_TM_GEN_TONE";
    return this.WDATA[2] + "?";
}

function initializeFromDevice() {
    receivedSinceLastCheck = false;
    door = new Door(); //the door we're talking to
    pets = new Array(); //array containing all pets in the door
    //masterPet = new Pet(); //master pet access settings
    //displayString("Requesting everythang.");
    sendToDevice(generate_GetPowerModeSettings());
    sendToDevice(generate_GetDoorModeSettings());
    sendToDevice(generate_GetDoorSnAndFirmware());
    console.error("SENT INITIALIZATION MESSAGES");
    //sendToDevice(generate_GetMasterPetAccessSettings());
    //displayString("Done requesting everythang.");
}

function checkConnection_Tick() {
    //if (receivedSinceLastCheck == false) {
        //showConnecting();
        //console.error("No recent receives. Must be disconnected!");
        //deviceDisconnected();
    //}
    //else {
        //receivedSinceLastCheck = false;
        sendToDevice(generate_GetPowerModeSettings());
    //}
}

function deviceDisconnected() {
    console.error("Device connection failed.");
    window.clearInterval(checkConnectionTmr);
    if (document.getElementById('connecting').style.visibility == "visible") return; //if already on loading page, we don't need to redo the rest of this stuff

    //reset our local data:
    requestAllPetsAfterWeKnowNumber = true;
    showConnecting(); 
    document.getElementById('usbIndicator').src = "/apps/PASSport/img/passport_UIUX_USB_OFF.png";
}

function initAllPets() {
    console.log("---initAllPets()---");

    //request data for each pet in the door, inc. master pet:
    //sendToDevice(generate_GetMasterPetAccessSettings());
    for (var i = 0; i < door.numPets; i++) {
        sendToDevice(generate_GetIndividualPetAccessSettings(i));
        sendToDevice(generate_GetIndividualPetName(i));
    }
}

/*-----------------from Parser-----------------*/
function doorUpdated() {
    /*door.mode = newDoor.mode;
    door.keypadLockStatus_tf = newDoor.keypadLockStatus_tf;
    door.volume = newDoor.volume;
    door.beepLowBatt_tf = newDoor.beepLowBatt_tf;
    door.shutdownState = newDoor.shutdownState;
    door.language = newDoor.language;
    door.timeDate = newDoor.timeDate;//*unfinished, will be 0 for now
    //TODO: UNFINISHED with BCD time conversions
    door.dateFormat = newDoor.dateFormat;
    door.timeFormat = newDoor.timeFormat;
    door.numPets = newDoor.numPets;*/
    console.log("Door has been updated! #Pets: " + door.numPets);

    if (requestAllPetsAfterWeKnowNumber) {
        requestAllPetsAfterWeKnowNumber = false;
        initAllPets();
    }
}

function updateMasterPet(newMasterPet) {
    masterPet = newMasterPet;
    masterPet.name = "-Master-";
    //refreshPetStatus();
    //refreshPetSettingsPage();
}

function addOrUpdatePet(newPet) {
    console.log("Adding pet: " + newPet.name);
    for (var i = 0; i < pets.length; i++) {//see if it already exists!
        if (pets[i].id == newPet.id) {
            console.error("Pet " + newPet.id + " already exists! Updating!");
            newPet.name = pets[i].name; //this message doesn't incude name, so make sure and keep the current one
            pets[i] = newPet;
            refreshPetLists();
            return;
        }
    }
    pets.push(newPet);
    refreshPetLists();
}

function updatePetName(newPet){
    console.log("updatePetName(" + newPet.name + ")");
    for (var i = 0; i < pets.length; i++) {//see if it already exists!
        if (pets[i].id == newPet.id) {
            pets[i].name = newPet.name;
            refreshPetLists();
            return;
        }
    }
    console.error("Received name for a pet which doesn't exist. #=" + newPet.id + "   name=" + newPet.name);
}

function updatePetLocation(id, location){
    console.error("updatePetLocation() - not implemented");
    //refreshPetStatus();
}

function individualPetDeleted(newPet) { 
    for (var i=0; i<pets.length; i++){
        if (pets[i].rfid_lsw == newPet.rfid_lsw && pets[i].rfid_msw == newPet.rfid_msw) {
            console.log("Deleted pet: " + pets[i].name);
            pets.splice(i, 1);
            refreshPetLists();
        }
    }
}

/*------------main page (outer frame)-----------*/
function setBatteryDisplay(percent) {
    if (percent < 0) {
        document.getElementById('batteryIndicator').style.visibility = 'hidden'; //hide battery indicator
        if (document.getElementById('wallPowerIndicator').style.visibility != 'visible') document.getElementById('wallPowerIndicator').style.visibility = 'visible';
        return;
    }
    var element = document.getElementById('batteryIndicator');
    if (percent > 90) element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator10.png";
    else if (percent > 80) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator09.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator09.png"; }
    else if (percent > 70) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator08.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator08.png"; }
    else if (percent > 60) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator07.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator07.png"; }
    else if (percent > 50) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator06.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator06.png"; }
    else if (percent > 40) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator05.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator05.png"; }
    else if (percent > 30) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator04.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator04.png"; }
    else if (percent > 20) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator03.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator03.png"; }
    else if (percent > 10) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator02.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator02.png"; }
    else if (percent >= 0) { if (element.src != "/apps/PASSport/img/passport_UIUX_battery_charge_indicator01.png") element.src = "/apps/PASSport/img/passport_UIUX_battery_charge_indicator01.png"; }
    if (element.style.visibility != 'visible') element.style.visibility = 'visible'; //show battery indicator
    document.getElementById('wallPowerIndicator').style.visibility = 'hidden';
}

function btnCloseAlert_onclick() {
    console.log("btnCloseAlert_onclick()");
    $("#MessageBoxBig").hide();
    $("#MessageBoxSmall").hide();
}

function showAlertPanel(msg) {
    $(".alertText").html(msg); //set the text of both popup boxes

    if ($(window).width() > 850) { //show the appropriate one based on window size
        $("#MessageBoxBig").show();
    }
    else $("#MessageBoxSmall").show();
}

/*-------------button presses------------*/
function setLanguage_next() {
    showStep_setName();
    document.getElementById('lblSetLanguage').className = "otherSteps";
    document.getElementById('lblNameDoor').className = "currentStep";
    document.getElementById('imgCheckSetLanguage').style.visibility = "visible";
    $("#imgCheckSetLanguage").attr("src", "/apps/PASSport/img/checkmark_small.png");
    //showStep_setTimeDate();
    //showStep_namePet();
}
function SetTimeDate_Prev() {
    showStep_setName();
    document.getElementById('lblSetTimeDate').className = "otherSteps";
    document.getElementById('lblNameDoor').className = "currentStep";
    document.getElementById('imgCheckNameDoor').style.visibility = "hidden";
    $("#imgCheckSetLanguage").attr("src", "/apps/PASSport/img/checkmark_small.png");
}

function nameDoor_next() {
    doorName = document.getElementById("tbDoorName").value;
    sendEventToServer("setSettingsValue", { cmd: "DoorName", val: doorName });
    updateLcdText();
    //showStep_setLanguage();
    showStep_setTimeDate();
    document.getElementById('lblNameDoor').className = "otherSteps";
    document.getElementById('lblSetTimeDate').className = "currentStep";
    document.getElementById('imgCheckNameDoor').style.visibility = "visible";
    $("#imgCheckNameDoor").attr("src", "/apps/PASSport/img/checkmark_small.png");
}

function setTimeDate_next() {
    saveDoorSettings();
    showStep_namePet();
    document.getElementById('lblSetTimeDate').className = "otherSteps";
    document.getElementById('lblNamePet').className = "currentStep";
    document.getElementById('Chapter1').className = "OtherChapter";
    document.getElementById('Chapter2').className = "CurrentChapter";
    document.getElementById('imgCheckSetTimeDate').style.visibility = "visible";
    $("#imgCheckSetTimeDate").attr("src", "/apps/PASSport/img/checkmark_small.png");
    //showStep_addPet1();
}

function learnPet1_next() {
    showStep_addPet2();

    document.getElementById('imgCheckLearnPet').style.visibility = "visible";
    $("#imgCheckLearnPet").attr("src", "/apps/PASSport/img/checkmark_small.png");
}

function namePet_next() {
    if (document.getElementById("tbPetName").value.length < 1) {
        showAlert("A name must be entered!");
        return;
    }
    document.getElementById("curPetName").innerHTML = document.getElementById("tbPetName").value;
    document.getElementById('lblNamePet').className = "otherSteps";
    document.getElementById('lblLearnPet').className = "currentStep";
    document.getElementById('imgCheckNamePet').style.visibility = "visible";
    $("#imgCheckNamePet").attr("src", "/apps/PASSport/img/checkmark_small.png");
    showStep_addPet1();

}

function finishWizard() {
    window.location.href = 'PASSport_main.html';
}

/*-------------show specific steps--------------*/
function showConnecting() {
    hideSteps();
    document.getElementById('connecting').style.display = 'block';
}

function showStep_setName() {
    hideSteps();
    document.getElementById("nameDoor").style.display = 'block';
}

function showStep_setLanguage() {
    hideSteps();
    
    document.getElementById("setLanguage").style.display = 'block';
    $("#imgCheckNameDoor").attr("src", "/apps/PASSport/img/checkmark.png");
    document.getElementById("imgCheckSetLanguage").style.visibility = 'hidden';
    document.getElementById('lblSetLanguage').className = "currentStep";
    document.getElementById('lblNameDoor').className = "otherSteps";
}

function showStep_setTimeDate() {
    hideSteps();
    // refreshTimeSelection();    
    document.getElementById("setTimeDate").style.display = 'block';
    $("#imgCheckNameDoor").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckSetLanguage").attr("src", "/apps/PASSport/img/checkmark_small.png");
}
function namePet_Prev() {
    hideSteps();
    // refreshTimeSelection();    
    document.getElementById("setTimeDate").style.display = 'block';
    document.getElementById("imgCheckSetTimeDate").style.visibility = 'hidden';
    document.getElementById('lblSetTimeDate').className = "currentStep";
    document.getElementById('lblNamePet').className = "otherSteps";
    document.getElementById('Chapter1').className = "CurrentChapter";
    document.getElementById('Chapter2').className = "OtherChapter";
}

function showStep_namePet() {
    hideSteps();
    document.getElementById("tbPetName").value = "";
    document.getElementById("namePet").style.display = 'block';
    document.getElementById("tbPetName").focus();
    $("#imgCheckNameDoor").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckSetLanguage").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckSetTimeDate").attr("src", "/apps/PASSport/img/checkmark_small.png");
}
function learnPet1_Prev(){
    hideSteps();
    document.getElementById("tbPetName").value = "";
    document.getElementById("namePet").style.display = 'block';
    document.getElementById("tbPetName").focus();
    document.getElementById("imgCheckNamePet").style.visibility = 'hidden';
    document.getElementById('lblLearnPet').className = "otherSteps";
    document.getElementById('lblNamePet').className = "currentStep";

    $("#imgCheckSetTimeDate").attr("src", "/apps/PASSport/img/checkmark_small.png");

}

function showStep_addPet1() {
    hideSteps();
    document.getElementById("learnPet1").style.display = 'block';
    $("#imgCheckNamePet").attr("src", "/apps/PASSport/img/checkmark_small.png");
}

function showStep_addPet2() {
    hideSteps();
    document.getElementById("learnPet2").style.display = 'block';

    //start countdown timer
    clearInterval(learnPetTimeout);
    learnPetRemainingTime = 30;
    learnPetTimeout = setInterval(learnPetTimedOut, 1000);

    //tell door we want to create a new pet
    sendToDevice(generate_SetCreatePet()); //TODO: handle a NACK response
}

function showStep_finished() {
    clearInterval(learnPetTimeout);
    hideSteps();
    document.getElementById("allFinished").style.display = 'block';
    $("#imgCheckNameDoor").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckSetLanguage").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckSetTimeDate").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckNamePet").attr("src", "/apps/PASSport/img/checkmark_small.png");
    $("#imgCheckLearnPet").attr("src", "/apps/PASSport/img/checkmark_small.png");
}

function hideSteps() {
    document.getElementById("connecting").style.display = "none";
    document.getElementById("setLanguage").style.display = "none";
    document.getElementById("nameDoor").style.display = "none";
    document.getElementById("namePet").style.display = "none";
    document.getElementById("setTimeDate").style.display = "none";
    document.getElementById("learnPet1").style.display = "none";
    document.getElementById("learnPet2").style.display = "none";
    document.getElementById("allFinished").style.display = "none";

    $("#imgCheckNameDoor").attr("src", "");
    $("#imgCheckSetLanguage").attr("src", "");
    $("#imgCheckSetTimeDate").attr("src", "");
    $("#imgCheckNamePet").attr("src", "");
    $("#imgCheckLearnPet").attr("src", "");
}

/*---------------------Misc...------------------*/
function learnPetTimedOut() {
    if (--learnPetRemainingTime > 0) {//haven't timed out yet! update countdown display.
        //console.log(learnPetRemainingTime + " seconds remaining.");
        document.getElementById("secsRemaining").innerHTML = learnPetRemainingTime;
    }
    else {//timed out. go back to add pet start page.
        clearInterval(learnPetTimeout);
        document.getElementById("secsRemaining").innerHTML = "30";
        showStep_addPet1();
        //showAlert("Timed out while waiting to learn a pet!"); //this alert now comes from the parser
    }
}

function regenerateSelectBoxWithNumberRange(elementName, min, max) {
    // Removes all options for the select box
    $('#' + elementName + " option").remove();

    var count = max - min;
    for (var i = 0; i <= count; i++) {
        var iStr = min + "";
        if (min < 10) {
            iStr = "0" + iStr; //left pad with 0
        }
        $('#' + elementName).append($("<option></option>")
                    .attr("value", iStr)
                    .text(iStr));
        min++;
    }
}

function isConnected() {
    if (document.getElementById("Connecting").style.display != "none") return false; //not connected
    return true;
}

function refreshPetLists() {
    var tempString = "<ul><li>Pets In Door:<ul>";
    for(var i=0; i<pets.length; i++){
        tempString += "<li>" + pets[i].name + "</li>";
    }
    tempString += "</ul>";
    //document.getElementById("petsList").innerHTML = tempString; //removed per request from door group
    updateLcdText();
}

function updateLcdText() {
    if (doorName=="") doorName = "Passport Door";
    document.getElementById("lcdText").innerHTML = doorName;//  + "<br />" + pets.length + " pets.";
}

function saveDoorSettings() {
    console.log("Saving door settings.");
    sendToDevice(generate_SetDoorModeSettings(true));
}
/*-----------Time/Date---------------------------*/
function initFields(){
    regenerateSelectBoxWithNumberRange('selHH', 1, 12);
    regenerateSelectBoxWithNumberRange('selMM', 0, 59);
    regenerateSelectBoxWithNumberRange('selYear', 2010, 2050);
}

function refreshTimeSelection() {
    //set time selected in dropdown boxes
    console.log("Door: " + door.numPets);
    console.log("test: " + document.getElementById('selMM').options.length + "/" + door.timeDate.min);
    document.getElementById('selMM').options[door.timeDate.min].selected = true; //set minute

    if (door.timeFormat == Config_H.TIME_FORMAT_12H) { //12 Hour Format
        document.getElementById('rb12Hr').checked = true;
        if (document.getElementById("selHH").length > 12) { //repopulate hour selectbox if 12/24hr setting changed
            regenerateSelectBoxWithNumberRange("selHH", 1, 12);
        }
        //set hour:
        var tempHour = (door.timeDate.hour - 1) % 12;
        document.getElementById('selHH').options[tempHour].selected = true;
        //set am/pm:
        document.getElementById('selAmPm').hidden = false; //.disabled = false;
        if (door.timeDate.hour < 12) document.getElementById('selAmPm').options[0].selected = true;
        else document.getElementById('selAmPm').options[1].selected = true;
    }
    else {//24 Hour Format
        document.getElementById('rb24Hr').checked = true;
        document.getElementById('selAmPm').hidden = true; //.disabled = true;
        if (document.getElementById("selHH").length != 24) { //repopulate hour selectbox if 12/24hr setting changed
            regenerateSelectBoxWithNumberRange("selHH", 0, 23);
        }
        document.getElementById('selHH').options[door.timeDate.hour].selected = true;
    }

    refreshDateSelection();
}

function refreshDateSelection() {
    console.log("refreshDateSelection");
    //set date format
    if (door.dateFormat == 0) document.getElementById('rbMmmddyyyy').checked = true;
    else document.getElementById('rbDdmmmyyyy').checked = true;

    //regenerate day #s if mon/year changed (some months have different number of days)
    var selDay = document.getElementById('selDay');
    if (selDay.options.length != getDaysInMonth(door.timeDate.mon, door.timeDate.year)) {
        var curSelection = selDay.selectedIndex;
        regenerateSelectBoxWithNumberRange('selDay', 1, getDaysInMonth(door.timeDate.mon, door.timeDate.year) + 1);
        if (curSelection < selDay.options.length) selDay.selectedIndex = curSelection; //keep date selection where it was if possible
    }

    document.getElementById('selDay').options[door.timeDate.mday - 1].selected = true;
    document.getElementById('selMonth').options[door.timeDate.mon - 1].selected = true;
    document.getElementById('selYear').options[(door.timeDate.year - 10)].selected = true;
}

function rbHourFormat_onchange() {
    if (document.getElementById("rb12Hr").checked) door.timeFormat = Config_H.TIME_FORMAT_12H;
    else door.timeFormat = Config_H.TIME_FORMAT_24H;
    refreshTimeSelection();
    madeUnsavedChanges(true);
}

function selTime_onchange() {
    var hour = document.getElementById('selHH').selectedIndex;
    var min = document.getElementById('selMM').selectedIndex;
    if (door.timeFormat == Config_H.TIME_FORMAT_12H) {
        hour++; //list starts at 1, not 0
        if (document.getElementById('selAmPm').selectedIndex == 1) hour += 12; //pm
    }
    if (hour == 24) hour = 0;
    door.timeDate.hour = hour;
    door.timeDate.min = min;
    console.error("Saving datetime: " + hour + ":" + min);
    //madeUnsavedChanges(true);
}

function rbDateFormat_onchange() {
    if (document.getElementById("rbMmmddyyyy").checked) {
        door.dateFormat = Config_H.DATE_FORMAT_MMMDD;
        $("#selDay").before($("#selMonth"));
    }
    else {
        door.dateFormat = Config_H.DATE_FORMAT_DDMMM;
        $("#selMonth").before($("#selDay"));
    }
}

function selMonthYear_onchange() {
    door.timeDate.year = document.getElementById('selYear').selectedIndex + 10;
    door.timeDate.mon = document.getElementById('selMonth').selectedIndex + 1;
    console.log("month/year changed! " + door.timeDate.mon + "/" + door.timeDate.year);
    refreshDateSelection(); //if month or year change, we may need to regenerate the day selectbox due to different # of days in month
}

function selDay_onchange() {
    door.timeDate.mday = document.getElementById('selDay').selectedIndex + 1;
    console.log("day changed! " + door.timeDate.mday);
}

function selLanguage_onchange() {
    door.language = document.getElementById('selLanguage').selectedIndex;
}

//modify by dmitry 6/12/13
function btnCloseAlert_onclick() {
    console.log("btnCloseAlert_onclick()");
    $("#MessageBoxBig").hide();
    $("#MessageBoxSmall").hide();
}
//end modify by dmitry 6/12/13

/*-----------------------------------------------*/
