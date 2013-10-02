
var windowSize = { width: 955, height: 670 }; //width: 920, height: 670
var isWin = checkIsWindows();
var RSC_Connectivity_H = new RSC_Connectivity_H_client();//defines values used in rsc communication spec
var RFID_App_H = new RFID_App_H_client(); //defines values used in rsc communication spec
var Config_H = new Config_H_client(); //defines values used in rsc communication spec
var door = new Door(); //the door we're talking to
var pets = new Array(); //array containing all pets in the door
var masterPet = new Pet(); //master pet access settings
var requestAllPetsAfterWeKnowNumber = true; //on connect we poll for # of pets in door. if this flag is set, we'll request all pet data as soon as we get a pet count
var checkConnectionTmr = null; //timer. on tick, we send a power query, and we check if we received a response to our previous query (if not, the device must have disconnected)
var receivedSinceLastCheck = false; //Starts false. Set true when message received. Checked & reset to false in checkConnection_Tick() to ensure we're still connected.
var prevAccessModeSelection = 1; //previously selected access mode. jump back to it if "timer" mode selected, but user cancels out of the editor popup for it
var prevPetSelection = 0; //selectbox index of last pet that was selected. so we can jump back to it if user changes pet selection and chooses "cancel" when prompted about unsaved changes
var c, ctx; //context for canvas graphics in pet timer editor
var currentEditPet = {}; //copy of pet currently having its timers edited
var unsavedChangesOnPage = false; //unsaved changes on current tab will prompt to save when user tries to change tabs
var unsavedTimeChanges = false; //if time not changed, we don't set it when setting other door settings.
var learnPetTimeout = null; //timeout handle. used when we begin to learn a pet, to know how long to wait until giving up
var learnPetRemainingTime = 30; //seconds
var postPromptTargetTab = ""; //set when user clicks a main navigation button on the top bar. used when user selects an option on a "save changes?" popup to jump to the page they had selected.
var doorName = "Passport";
initDialogs(); //initialize the jqueryui dialog/alert boxes

//------------------------
addEventListener('app-msg', parseEvent);
function over(obj) {
    if (obj == "PetStatus") {
        //document.getElementById('PetStatus').style.background = 'url(/apps/PendantTrainer/Images/btnBackOver.jpg)';
        document.getElementById('imgPetStatus').src = 'img/passport_UIUX_petstatus_OVER.png';
    }
    if (obj == "DoorSettings") {
        //document.getElementById('DoorSettings').style.background = 'url(/apps/PendantTrainer/Images/btnBackOver.jpg)';
        document.getElementById('imgDoorSettings').src = 'img/passport_UIUX_doorsettings_OVER.png';
    }
    if (obj == "PetSettings") {
        //document.getElementById('PetSettings').style.background = 'url(/apps/PendantTrainer/Images/btnBackOver.jpg)';
        document.getElementById('imgPetSettings').src = 'img/passport_UIUX_petsettings_OVER.png';
    }
}
function out(obj) {
    
    if (document.getElementById("sidePnlHome").style.display != "none") {
        if (obj == "PetStatus") {
            document.getElementById('imgPetStatus').src = '/apps/PASSport/img/passport_UIUX_petstatus_OVER.png';
        }
        if (obj == "DoorSettings") {
            document.getElementById('imgDoorSettings').src = '/apps/PASSport/img/passport_UIUX_doorsettings_IDLE.png';
        }
        if (obj == "PetSettings") {
            document.getElementById('imgPetSettings').src = '/apps/PASSport/img/passport_UIUX_petsettings_IDLE.png';
        }
    }
    if (document.getElementById("sidePnlDoorSettings_help").style.display != "none") {
        if (obj == "PetStatus") {
            document.getElementById('imgPetStatus').src = '/apps/PASSport/img/passport_UIUX_petstatus_IDLE.png';
        }
        if (obj == "DoorSettings") {
            document.getElementById('imgDoorSettings').src = '/apps/PASSport/img/passport_UIUX_doorsettings_OVER.png';
        }
        if (obj == "PetSettings") {
            document.getElementById('imgPetSettings').src = '/apps/PASSport/img/passport_UIUX_petsettings_IDLE.png';
        }
    }  
    if (document.getElementById("sidePnlPetSettings_help").style.display != "none") {
        if (obj == "PetStatus") {
            document.getElementById('imgPetStatus').src = '/apps/PASSport/img/passport_UIUX_petstatus_IDLE.png';
        }
        if (obj == "DoorSettings") {
            document.getElementById('imgDoorSettings').src = '/apps/PASSport/img/passport_UIUX_doorsettings_IDLE.png';
        }
        if (obj == "PetSettings") {
            document.getElementById('imgPetSettings').src = '/apps/PASSport/img/passport_UIUX_petsettings_OVER.png';
        }
    }
      
}

window.onload = function () {
//showPromptSaveChanges();
//showAlert("test");
    initDoorSettings();
    initPetSettings();
    initTimerEditor();
    getLatestFwVersion();
    getLatestSwVersion();
    try {
        $("#myCanvas").attr("width", "480px");
        $("#myCanvas").attr("height", "60px");
        c = document.getElementById("myCanvas");
        //c.width = 300;
        //c.height = 150;

        ctx = c.getContext("2d");
        ctx.fillStyle = "#00FF00";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		//showAlert("TESTACULAR!");
    }
    catch (err) {
        console.error("No canvas support!");
    }
};

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
        if (rsc_comm.WDATA[4] == RSC_Connectivity_H.TRUE) displayString("ACK");
        else if (rsc_comm.WDATA[4] == RSC_Connectivity_H.FALSE) displayString("NACK");
        else console.log("Malformed ACK/NACK packet received.");
    }
    else { //it must be a normal RSC_COMM message
        displayString(rsc_comm.toString());
        parse_RSC_COMM(rsc_comm);
    }
}

function parseEvent(e) {
    if (e.isValid === undefined) return;
    //console.log("Parsing command: " + e.command);

    if (e.command == 'app-ready') {
        console.log("Received app version: " + e.data);
        document.getElementById('appVersion').innerHTML = e.data;
        //console.log("requesting connectToDevice");
        requestSetWindowSize();
        requestConnectToDoor();
        sendEventToServer("getSettingsValue", {name: "DoorName"} );
        /*var eventData = {
            vid: "2328",
            pid: "03ed"
        }
        sendEventToServer('connectByVidPid', eventData);*/
    }
    else if (e.command == 'appVersion') {
        console.log("appVersion? " + e.data);
    }
    else if (e.command == 'deviceConnectionFailed') {
        deviceDisconnected();
    }
    else if (e.command == 'deviceConnectionEstablished') {
        var deviceType = e.data.type;
        console.log("Device connection established. " + deviceType);
        if(deviceType == "hid"){
            showPromptYesNo("This device is in Update mode. Do update?", 
                function(){ //user clicks "yes"
                    //autoStartFirmwareUpdate();
                    sendEventToServer('beginFirmwareUpdate', {url: firmwareDownloadPath});
                },
                function(){ //user clicks "no"
                    $('#btnInstallFwUpdate').show();
                    $("#fwUpdateProgressDiv").hide();
                    showAlert("The door is still in update mode and must be powered off and back on again to return to regular mode.");

                }
            );
        }
        else{
            $("#fwUpdateProgressDiv").hide();
            $('#btnInstallFwUpdate').show();
            var element = document.getElementById('usbIndicator');
            if (element.src != "/apps/PASSport/img/passport_UIUX_USB_ON.png") element.src = "/apps/PASSport/img/passport_UIUX_USB_ON.png";
            showPetStatus();
            window.setTimeout(initializeFromDevice, 500); //needed a slight delay or message never got through    
            checkConnectionTmr = window.setInterval(checkConnection_Tick, 3000); //every few seconds, send a power request (to make sure we're still connected)
        }
    }
    else if (e.command == 'serialEvent') {
        var rsc_comm = new RSC_COMM();
        rsc_comm.fillFromJSON(e.data);
        parse(rsc_comm);
    }
    else if (e.command == 'fwUpdateProgress'){
        console.error("Update progress:" + e.data.percent + "% Msg:" + e.data.msg );
        updateFwProgressBar(e.data.percent, e.data.msg);
    }
    else if (e.command == 'fwUpdateComplete'){
        $('#fwUpdateProgressDiv').hide();
        console.log("update complete! requesting to reconnect to the door!");
        requestConnectToDoor();
    }
    else if (e.command == 'settingsNameValuePair') {
        //console.error("test: " + e.data.name + "/" + e.data.value);
        if(e.data.name == 'DoorName') {
            doorName = e.data.value;
            $('#lcd_display').html(doorName);
            $('#cmbSelectDoor').html(doorName);
            //updateLcdText();
        }
    }
    else if (e.command == 'showAlert'){
        showAlert(e.data);
    }
    else {
        console.log("got unknown command! cmd:" + e.command);
    }
}

function requestConnectToDoor() {
    console.log("Requesting connectToDevice.");
    var deviceList = new Array();
    deviceList[0] = { vid: "2328", pid: "03ed", type: "serialport"} //door
    deviceList[1] = { vid: "2328", pid: "0FFF", type: "hid"} //door bootloader
    var eventData = {
        deviceList: deviceList
    }
    sendEventToServer('connectByVidPid', eventData);
}

/*function requestConnectToDoor_Bootloader() {
    console.log("Requesting connectToDevice in BOOTLOADER mode.");
    var vidPids = new Array();
    vidPids[0] = { type: "hid", vid: "2328", pid: "0FFF"} //door
    var eventData = {
        
        vidPidList: vidPids
    }
    sendEventToServer('connectByVidPid', eventData);
}*/

function requestSetWindowSize() {
    sendEventToServer('setWindowSize', windowSize);
}

function sendEventToServer(eventName, customData) {
    console.log('sendEventToServer()');
    var myEvent = new window.Event("server-msg");
    myEvent.isValid = true;
    myEvent.command = eventName;
    myEvent.data = customData;
    //console.log("dispatching event: " + eventName);
    window.dispatchEvent(myEvent);
}

function sendToDevice(rsc_comm) {
    //console.log("sendToDevice");
    var msgObj = {
        type: "serialport",
        msg: JSON.stringify(rsc_comm)
    }
    sendEventToServer('sendToDevice', msgObj);
}

function initializeFromDevice() {
    receivedSinceLastCheck = false;
    requestAllPetsAfterWeKnowNumber = true;
    door = new Door(); //the door we're talking to
    pets = new Array(); //array containing all pets in the door
    masterPet = new Pet(); //master pet access settings
    sendToDevice(generate_GetPowerModeSettings());
    sendToDevice(generate_GetDoorModeSettings());
    sendToDevice(generate_GetDoorSnAndFirmware());
    console.log("finished sending initialization msgs");
    //sendToDevice(generate_GetMasterPetAccessSettings());
    //displayString("Done requesting everythang.");
}

function checkConnection_Tick() {
    if (receivedSinceLastCheck == false) {
        //showConnecting();
        console.error("No recent receives. Must be disconnected!");
        sendToDevice(generate_GetPowerModeSettings());
        //deviceDisconnected();
    }
    else {
        receivedSinceLastCheck = false;
        sendToDevice(generate_GetPowerModeSettings());
    }
}

function deviceDisconnected() {
    console.log("Device connection failed.");
    displayString("Device connection failed.");
    window.clearInterval(checkConnectionTmr);
    if (document.getElementById('Connecting').style.visibility == "visible") return; //if already on loading page, we don't need to redo the rest of this stuff
    $('#btnInstallFwUpdate').hide();
    //reset our local data:
    requestAllPetsAfterWeKnowNumber = true;
    showConnecting(); 
    document.getElementById('usbIndicator').src = "/apps/PASSport/img/passport_UIUX_USB_OFF.png";
}

function initAllPets() {
    console.log("---initAllPets()---");

    //request data for each pet in the door, inc. master pet:
    sendToDevice(generate_GetMasterPetAccessSettings());
    for (var i = 1; i < door.numPets; i++) {
        sendToDevice(generate_GetIndividualPetAccessSettings(i));
        sendToDevice(generate_GetIndividualPetName(i));
    }
}

/*-----------------from Parser-----------------*/
function doorUpdated() {
    console.log("Door has been updated! #Pets: " + door.numPets);
    
    //send to doorSettings iFrame if we're currently viewing it
    refreshDoorSettingsPage();

    if (door.numPets == 0) {
        showPromptYesNo("This door has no pets. Run easy setup wizard?", confirmShowWizard, null);
    }

    if (requestAllPetsAfterWeKnowNumber) {
        requestAllPetsAfterWeKnowNumber = false;
        initAllPets();
    }
}

function confirmShowWizard() {
    console.log("Running setup wizard.");
    window.location.href = '/apps/PASSport/PASSport_wizard.html';
}

function updateMasterPet(newMasterPet) {
    masterPet = newMasterPet;
    masterPet.name = "-Master-";
    refreshPetStatus();
    refreshPetSettingsPage();
}

function addOrUpdatePet(newPet) {
    console.log("Adding pet: " + newPet.name);
    for (var i = 0; i < pets.length; i++) {//see if it already exists!
        if (pets[i].id == newPet.id) {
            console.error("Pet " + newPet.id + " already exists! Updating!");
            newPet.name = pets[i].name; //this message doesn't incude name, so make sure and keep the current one
            pets[i] = newPet;
            refreshPetStatus();
            refreshPetSettingsPage();
            return;
        }
    }
    pets.push(newPet);
    refreshPetStatus();
    refreshPetSettingsPage();
}

function updatePetName(newPet){
    console.log("updatePetName(" + newPet.name + ")");
    for (var i = 0; i < pets.length; i++) {//see if it already exists!
        if (pets[i].id == newPet.id) {
            pets[i].name = newPet.name;
            refreshPetStatus();
            reloadPetsList();
            return;
        }
    }
    console.error("Received name for a pet which doesn't exist. #=" + newPet.id + "   name=" + newPet.name);
}

function individualPetDeleted(newPet) {
    initializeFromDevice();
    /*for (var i=0; i<pets.length; i++){
        if(pets[i].rfid_lsw == newPet.rfid_lsw && pets[i].rfid_msw == newPet.rfid_msw){
            console.log("Deleted pet: " + pets[i].name);
            //showAlert(pets[i].name + " deleted.");
            pets.splice(i, 1);
            refreshPetIds(); 
            refreshPetStatus();
            refreshPetSettingsPage();
            return;
        }
    } */
}

//--------------jquery dialog/alert boxes----------
//jquery alerts because appjs on osx doesn't currently support alert/confirm (wtf!)
function initDialogs() {
    $(function () {
        $("#dialog-alert").dialog({
            autoOpen: false,
            resizable: false,
            width: 556,
            //modal: true,
            buttons: {
                "Ok": function () {
                    $(this).dialog("close");
                }
            }
        });
    });

    $(function () {
        $("#dialog-saveChanges").dialog({
            autoOpen: false,
            resizable: false,
            width: 556,
            modal: true,
            buttons: {
                "OK": function () {
                    $(this).dialog("close");
                },
                Cancel: function () {
                    $(this).dialog("close");
                }
            }
        });
    });

    $(function () {
        $("#dialog-yesno").dialog({
            autoOpen: false,
            resizable: false,
            width: 556,
            modal: true,
            buttons: {
                "Yes": function () {
                    $(this).dialog("close");
                },
                "No": function () {
                    $(this).dialog("close");
                }
            }
        });
    });
}

function showPromptSaveChanges(text, fnYes, fnNo) {
    $("#promptSaveText").html(text);
    $("#dialog-saveChanges").dialog({
        buttons: {
            'Yes': function () {
                fnYes();
                $(this).dialog('close');
                if (postPromptTargetTab == "pet status") showPetStatus();
                else if (postPromptTargetTab == "door settings") showDoorSettings();
                else if (postPromptTargetTab == "pet settings") showPetSettings();
            },
            'No': function () {
                fnNo();
                $(this).dialog('close');
                if (postPromptTargetTab == "pet status") showPetStatus();
                else if (postPromptTargetTab == "door settings") showDoorSettings();
                else if (postPromptTargetTab == "pet settings") showPetSettings();
            },
            'Cancel': function () {
                $(this).dialog('close');
                if (postPromptTargetTab == "pet status") showPetStatus();
                else if (postPromptTargetTab == "door settings") showDoorSettings();
                else if (postPromptTargetTab == "pet settings") showPetSettings();
            }
        }
    });

    $("#dialog-saveChanges").dialog("open");
}

function showPromptYesNo(text, fnYes, fnNo) {
    $("#promptYesNo").html(text);
    $("#dialog-yesno").dialog({
        buttons: {
            'Yes': function () {
                $(this).dialog('close');
                fnYes();
            },
            'No': function () {
                $(this).dialog('close');
                if (fnNo != null) fnNo();
            }
        }
    });

    $("#dialog-yesno").dialog("open");
}

function showAlert(text) {
    $("#alertText").html(text);
    $("#dialog-alert").dialog("open");
   //alert('test');
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

function promptSaveCurrentTab() {
    if (document.getElementById('PetStatus').style.display == 'block') return; //nothing to save here
    if (document.getElementById('DoorSettings').style.display == 'block') showPromptSaveChanges("You have unsaved door changes. Save them?", saveDoorSettings, btnRevertDoorSettings_onclick);
    if (document.getElementById('PetSettings').style.display == 'block') showPromptSaveChanges("You have unsaved pet changes. Save them?", saveSelectedPetSettings, btnRevertPetSettings_onclick);
}

function saveCurrentTab(){
    if (document.getElementById('PetStatus').style.display == 'block') return; //nothing to save here
    if (document.getElementById('DoorSettings').style.display == 'block') return saveDoorSettings(unsavedTimeChanges);
    if (document.getElementById('PetSettings').style.display == 'block') return saveSelectedPetSettings();
}

function btnPetStatus_onclick() {
    postPromptTargetTab = "pet status";
    //document.getElementById('imgPetStatus').src = '/apps/PASSport/img/passport_UIUX_petstatus_OVER.png';
    //document.getElementById('imgDoorSettings').src = '/apps/PASSport/img/passport_UIUX_doorsettings_IDLE.png';
    //document.getElementById('imgPetSettings').src = '/apps/PASSport/img/passport_UIUX_petsettings_IDLE.png';
    if (unsavedChangesOnPage) {
        promptSaveCurrentTab();
        return;
    }

    if (!isConnected()) return;
    btnSidePnlNav_onclick('sidePnlHome');
    showPetStatus();
    refreshPetStatus();
}

function btnDoorSettings_onclick() {
    postPromptTargetTab = "door settings";
    //document.getElementById('imgPetStatus').src = '/apps/PASSport/img/passport_UIUX_petstatus_IDLE.png';
    //document.getElementById('imgDoorSettings').src = '/apps/PASSport/img/passport_UIUX_doorsettings_OVER.png';
    //document.getElementById('imgPetSettings').src = '/apps/PASSport/img/passport_UIUX_petsettings_IDLE.png';
    if (unsavedChangesOnPage){
		promptSaveCurrentTab();
        return;
    }
    if (!isConnected()) return;
    btnSidePnlNav_onclick('sidePnlDoorSettings_help');    
    showDoorSettings();
    refreshDoorSettingsPage();
    //alert('done');    
}

function btnPetSettings_onclick() {
    postPromptTargetTab = "pet settings";
    //document.getElementById('imgPetStatus').src = '/apps/PASSport/img/passport_UIUX_petstatus_IDLE.png';
    //document.getElementById('imgDoorSettings').src = '/apps/PASSport/img/passport_UIUX_doorsettings_IDLE.png';
    //document.getElementById('imgPetSettings').src = '/apps/PASSport/img/passport_UIUX_petsettings_OVER.png';
    if (unsavedChangesOnPage){
		promptSaveCurrentTab();
        return;
    }

    if (!isConnected()) return;
    showPetSettings();
    refreshPetSettingsPage();
    btnSidePnlNav_onclick('sidePnlPetSettings_help');
}

function btnCloseAlert_onclick() {
	console.log("btnCloseAlert_onclick()");
	$("#MessageBoxBig").hide();
}

function showAlertPanel(msg){
    $(".alertText").html(msg); //set the text of both popup boxes

    $("#MessageBoxBig").show();
}

/*---------------pet status page---------------*/
function refreshPetStatus() {
    if (document.getElementById('PetStatus').style.visibility == 'hidden') return; //only update page if we're on it

    var testString = '';// '<h3 style="margin: 5px">Pet Status</h3>';
    for (var i = 0; i < pets.length; i++) {
        testString += generatePetStatusListItem(pets[i]) + "<br />";
    }
    document.getElementById('PetStatus_List').innerHTML = testString;
}

function petStatus_showHelp() {
    btnSidePnlNav_onclick('sidePnlPetStatus_help');
    //window.open("Passport_Manual.pdf")
    sendEventToServer("lowLvlDeviceSpecific", {cmd: "show manual"});
}

function petStatus_showVideo() {
    showAlertPanel("Tutorial videos still in development.");
}

function generatePetStatusListItem(pet) {
    /*old javascript version
    var html_str = '<div style="width:80%;">';
    //name label
    html_str += "<span class='right-main-title'>" + pet.name + "</span>";
    //history button
    html_str += '<button id="btnViewPetHistory_' + pet.id + '" value="ViewPetHistory" onclick="btnShowPetHistory_onclick(' + pet.id + ')" style="border:0px; background-color:transparent; ">';
    html_str += '<img title="View Pet History" src="/apps/PASSport/img/passport_UIUX_history.png"  width="30" />';
    html_str += '</button>';
    //edit button
    html_str += '<button id="btnEditPet_' + pet.id + '" value="EditPet" onclick="btnEditPet_onclick(' + pet.id + ')" style="border:0px; background-color:transparent; ">';
    html_str += '<img title="Edit Pet" src="/apps/PASSport/img/passport_UIUX_edit.png" width="30" />';
    html_str += '</button>';
    //in/out status icon
    var icon = (pet.lastDirectionOfTravel == RFID_App_H.LOG_ACTIVITY_DIR_OUT) ? "/apps/PASSport/img/passport_UIUX_Inner_petout.png" : "/apps/PASSport/img/passport_UIUX_Inner_petin.png";
    html_str += '<img title="Pet Location" src=' + icon + ' style="float: right; clear:right; margin-top: -15px;" width="42"/>';
    html_str += '</div>';
    return html_str;*/
    //new javascript version

    var html_str = '<div style="width:80%;">';
    //name label
    html_str += "<span class='right-main-title'>" + pet.name + "</span>";
    //history button
    html_str += '&nbsp;&nbsp;&nbsp;<a class="history" id="btnViewPetHistory_' + pet.id + '" value="ViewPetHistory" onclick="btnShowPetHistory_onclick(' + pet.id + ')"></a>';
    //html_str += '<button id="btnViewPetHistory_' + pet.id + '" value="ViewPetHistory" onclick="btnShowPetHistory_onclick(' + pet.id + ')" style="border:0px; background-color:transparent; ">';
    //html_str += '<img title="View Pet History" src="/apps/PASSport/img/passport_UIUX_history.png"  width="30" />';
    //html_str += '</button>';

    //edit button
    html_str += '&nbsp;&nbsp;&nbsp;&nbsp;<a href="#btnPetSettings" class="edit" id="btnEditPet_' + pet.id + '" value="EditPet" onclick="btnEditPet_onclick(' + pet.id + ')"></a>';
    //html_str += '<button id="btnEditPet_' + pet.id + '" value="EditPet" onclick="btnEditPet_onclick(' + pet.id + ')" style="border:0px; background-color:transparent; ">';
    //html_str += '<img title="Edit Pet" src="/apps/PASSport/img/passport_UIUX_edit.png" width="30" />';
    //html_str += '</button>';
    //in/out status icon
    var icon = (pet.lastDirectionOfTravel == RFID_App_H.LOG_ACTIVITY_DIR_OUT) ? "/apps/PASSport/img/passport_UIUX_Inner_petout.png" : "/apps/PASSport/img/passport_UIUX_Inner_petin.png";
    html_str += '<img title="Pet Location" src=' + icon + ' style="float: right; clear:right; margin-top: -15px;" width="42"/>';
    html_str += '</div>';
    return html_str;
}

function generatePetHistoryListItem(petName, timeDate, direction) {
    return "(" + getFormattedDate(timeDate) + ")   "
        + getFormattedTime(timeDate.hour, timeDate.min) + " - "
        + petName + " went " + getDirectionStr(direction) + ".";
}

function showPopupPetHistory(petName, petHistStr) {
    document.getElementById("petHist_name").innerHTML = petName;
    document.getElementById("petHist_text").innerHTML = petHistStr;
    document.getElementById("popUpHistory").style.display = "block";
}

function btnShowPetHistory_onclick(id) {
    console.log('btnShowPetHistory_onclick(' + id + ')');
    sendToDevice(generate_GetIndividualPetHistory(id));
}

function btnEditPet_onclick(id) {
    console.log('btnEditPet_onclick(' + id + ')');
    showPetSettings();
    refreshPetSettingsPage();
    document.getElementById('selPets').selectedIndex = prevPetSelection = (id);
    showSelectedPetSettings();
    //document.getElementById('PopUpRename').hidden = false;
}

/*--------------door settings page--------------*/
function initDoorSettings() {
    regenerateSelectBoxWithNumberRange('selHH', 1, 12);
    regenerateSelectBoxWithNumberRange('selMM', 0, 59);
    regenerateSelectBoxWithNumberRange('selYear', 2010, 2050);
    regenerateSelectBoxWithNumberRange('selDay', 1, 31);
}

function doorSettings_showHelp() {
    btnSidePnlNav_onclick('sidePnlDoorSettings_help');
    //window.open("Passport_Manual.pdf")
    sendEventToServer("lowLvlDeviceSpecific", {cmd: "show manual"});
}

function doorSettings_showVideo() {
    showAlertPanel("Tutorial videos still in development.");
}

function saveDoorSettings() {
    console.log("Saving door settings. Also set time = " + unsavedTimeChanges);
    sendToDevice(generate_SetDoorModeSettings(unsavedTimeChanges));
    madeUnsavedChanges(false);
}

function refreshDoorSettingsPage() {
    if (document.getElementById('PetSettings').style.visibility == 'hidden') return; //only update page if we're on it

    //set door mode
    var selMode = document.getElementById('selMode');
    selMode.options[door.mode].selected = true;

    //set time/date
    refreshTimeSelection();
    refreshDateSelection();

    //set low battery modes:
    if (door.shutdownState == 0) document.getElementById('rbUnlocked').checked = true;
    else document.getElementById('rbLocked').checked = true;

    if (door.beepLowBatt_tf == 0) document.getElementById('rbNoBeep').checked = true;
    else document.getElementById('rbBeep').checked = true;

    //set language
    document.getElementById('selLanguage').options[door.language].selected = true;
}

function refreshTimeSelection() {
    //set time selected in dropdown boxes

    try {
        document.getElementById('selMM').options[door.timeDate.min].selected = true; //set minute
        if (door.timeFormat == Config_H.TIME_FORMAT_12H) { //12 Hour Format
            document.getElementById('rb12Hr').checked = true;
            if (document.getElementById("selHH").length > 12) { //repopulate hour selectbox if 12/24hr setting changed
                regenerateSelectBoxWithNumberRange("selHH", 1, 12);
            }
            //set hour:
            var tempHour;
            if (door.timeDate.hour == 0) tempHour = 11;
            else tempHour = (door.timeDate.hour - 1) % 12;
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
    }
    catch (err) {
        console.error("refreshTimeSelection(): " + err);
    }
}

function refreshDateSelection() {
    console.log("refreshDateSelection");
    try {
        //set date format
        if (door.dateFormat == 0) {
            document.getElementById('rbMmmddyyyy').checked = true;
            $("#selDay").before($("#selMonth"));
            $("#selDay").before($("#slash1"));
        }
        else {
            document.getElementById('rbDdmmmyyyy').checked = true;
            $("#selMonth").before($("#selDay"));
            $("#selDay").before($("#slash1"));
        }

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
    catch (err) { console.error("refreshDateSelection: " + err) }
    
}

function btnDsEditName_onclick() {
    showAlert("Door cannot currently be renamed.");
    //showPopupRenamePet(true, door.name, "Rename Door");
}

function btnRevertDoorSettings_onclick() {
    sendToDevice(generate_GetDoorModeSettings());
    madeUnsavedChanges(false);
}

function btnSaveDoorSettings_onclick() {
    var alertText = "Saving door settings.";
    //if (!unsavedTimeChanges) alertText += "\n\nNot setting door's time because it was unchanged.";
	showAlert(alertText);
    //showAlertPanel(alertText);
    saveDoorSettings();
}

function selDoorMode_onchange() {
    door.mode = document.getElementById('selMode').selectedIndex;
    madeUnsavedChanges(true);
    //showAlert("mode changed! index:" + selectBox.selectedIndex);
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
        hour++;//list starts at 1, not 0
        if (document.getElementById('selAmPm').selectedIndex == 1) hour += 12;//pm
    }
    if (hour == 24) hour = 0;
    door.timeDate.hour = hour;
    door.timeDate.min = min;
    console.log("Saving datetime: " + hour + ":" + min);
    madeUnsavedChanges(true);
    unsavedTimeChanges = true;
}

function rbDateFormat_onchange() {
    if (document.getElementById("rbMmmddyyyy").checked) {
        door.dateFormat = Config_H.DATE_FORMAT_MMMDD;
        $("#selDay").before($("#selMonth"));
        $("#selDay").before($("#slash1"));
    }
    else {
        door.dateFormat = Config_H.DATE_FORMAT_DDMMM;
        $("#selMonth").before($("#selDay"));
        $("#selMonth").before($("#slash1"));
    }
    madeUnsavedChanges(true);
}

function selMonthYear_onchange() {
    door.timeDate.year = document.getElementById('selYear').selectedIndex + 10;
    door.timeDate.mon = document.getElementById('selMonth').selectedIndex+1;
    console.log("month/year changed! " + door.timeDate.mon + "/" + door.timeDate.year);
    refreshDateSelection(); //if month or year change, we may need to regenerate the day selectbox due to different # of days in month
    madeUnsavedChanges(true);
    unsavedTimeChanges = true;
}

function selDay_onchange() {
    door.timeDate.mday = document.getElementById('selDay').selectedIndex + 1;
    console.log("day changed! " + door.timeDate.mday);
    madeUnsavedChanges(true);
    unsavedTimeChanges = true;
}

function selLanguage_onchange() {
    door.language = document.getElementById('selLanguage').selectedIndex;
    madeUnsavedChanges(true);
}

function rbLowBattLock_onchange() {
    if (document.getElementById("rbLocked").checked) door.shutdownState = 1;
    else door.shutdownState = 0;
    madeUnsavedChanges(true);
}

function rbLowBattBeep_onchange() {
    if (document.getElementById("rbBeep").checked) door.beepLowBatt_tf = 1;
    else door.beepLowBatt_tf = 0;
    madeUnsavedChanges(true);
}

/*---------------pet settings page---------------*/
function initPetSettings() {
}

function petSettings_showHelp() {
    btnSidePnlNav_onclick('sidePnlPetSettings_help');
    //window.open("Passport_Manual.pdf");
    sendEventToServer("lowLvlDeviceSpecific", {cmd: "show manual"});
}

function petSettings_showVideo() {
    showAlertPanel("Tutorial videos still in development.");
}

function saveSelectedPetSettings() {
    console.log("Saving pet settings for: " + getSelectedPet().name);
    if (document.getElementById('selPets').selectedIndex > 0) {
        sendToDevice(generate_SetIndividualPetSettings(getSelectedPet()));
        sendToDevice(generate_GetIndividualPetAccessSettings(getSelectedPet().id)); //HACK: ack will be incorrect, so re-request
    }
    else {
        sendToDevice(generate_SetMasterPetSettings(masterPet));
        sendToDevice(generate_GetMasterPetAccessSettings()); //HACK: ack will be incorrect, so re-request
    }
    
    madeUnsavedChanges(false);
}

function refreshPetSettingsPage() {
    if (document.getElementById('PetSettings').style.visibility == 'hidden') return; //only update page if we're on it
    reloadPetsList();
    showSelectedPetSettings();
}

function reloadPetsList() {
    var currentSelection = document.getElementById('selPets').selectedIndex;
    $('#selPets option').remove();  //clear current list
    $('#selPets').append($("<option></option>").attr("value", "").text("-Master-"));
    for (var i = 0; i < pets.length; i++) {
        $('#selPets').append($("<option></option>").attr("value", "").text(pets[i].name));
    }
    //console.log("---- " + currentSelection + " < " + document.getElementById('selPets').length + " ???----");
    if (currentSelection < document.getElementById('selPets').length) document.getElementById('selPets').selectedIndex = prevPetSelection = currentSelection;
}

function masterIsSelected(){
    return (document.getElementById('selPets').selectedIndex == 0);
}

function rebuildSelAccessMode(){
    $('#selPetAccessMode option').remove();//clear all current values
    if (!masterIsSelected()) $('#selPetAccessMode').append($("<option></option>").attr("value", "Master").text("Master"));
    $('#selPetAccessMode').append($("<option></option>").attr("value", "In/Out").text("In/Out")); 
    $('#selPetAccessMode').append($("<option></option>").attr("value", "In Only").text("In Only")); 
    $('#selPetAccessMode').append($("<option></option>").attr("value", "Out Only").text("Out Only")); 
    $('#selPetAccessMode').append($("<option></option>").attr("value", "Timer").text("Timer")); 
}

function showSelectedPetSettings(){
    var selectedPet = getSelectedPet();
    //console.log("showSelectedPetSettings()->" + selectedPet.name);
    rebuildSelAccessMode();
    if (masterIsSelected()) document.getElementById('selPetAccessMode').selectedIndex = selectedPet.accessMode - 1;
    else document.getElementById('selPetAccessMode').selectedIndex = selectedPet.accessMode; //document.getElementById('selPetAccessMode').selectedIndex = selectedPet.accessMode;

    showPetRelatchTime(selectedPet.relatchTime);
    document.getElementById('selPetInTone').selectedIndex = selectedPet.inTone;
    document.getElementById('selPetOutTone').selectedIndex = selectedPet.outTone;

    if (!masterIsSelected() && getSelectedPet.accessMode == 0) {//if this pet is using master settings, it can't have its own settings
        document.getElementById("selPetRelatchTime").disabled = true;
        document.getElementById("selPetInTone").disabled = true;
        document.getElementById("selPetOutTone").disabled = true;
    }
    else {//if this pet is using custom settings (not master), then enable the menu items for editing
        document.getElementById("selPetRelatchTime").disabled = false;
        document.getElementById("selPetInTone").disabled = false;
        document.getElementById("selPetOutTone").disabled = false;
    }
    if (selectedPet.accessMode == 4) {//pet is set to timer mode. display its timers
        loadDivTimerSettings();
        showDivPetTimerDisplay(true);
    } else showDivPetTimerDisplay(false);//pet not set to timer mode. hide timer display
}

function loadDivTimerSettings(){
    var tempString = "";

    for (var i = 0; i < 4; i++) {
        var formattedTime = getFormattedTime(getSelectedPet().timers[i].hour, getSelectedPet().timers[i].minute);
        var accessMode = getAccessModeName(getSelectedPet().timers[i].accessMode);
        //console.error("ACCESS MODE:\"" + accessMode + "\"");
        if(accessMode != "---") {
            if(getSelectedPet() == masterPet && accessMode == "master") continue;
            tempString += formattedTime + " - " + accessMode + "<br />";
        }

    }

    document.getElementById('divPetTimerDisplayText').innerHTML = tempString;
}

function showDivPetTimerDisplay(flag) {
    if (flag) { document.getElementById('divPetTimerDisplay').style.display = 'block';  }
    else { document.getElementById('divPetTimerDisplay').style.display = 'none';  }
}

function showPetRelatchTime(relatchTime) {
    var index = relatchTime - 1;
    //possible values are 1-10, 15, 20, 25, 30, 40, 50, 60
    if (index < 10) { /*leave it how it is*/; }
    else if (index < 15) index = 10;
    else if (index < 20) index = 11;
    else if (index < 25) index = 12;
    else if (index < 30) index = 13;
    else if (index < 40) index = 14;
    else if (index < 50) index = 15;
    else if (index < 60) index = 16;
    else {
        console.error("THIS TOTALLY SHOULDN'T HAPPEN");
        index = 0;
    }
    
    document.getElementById('selPetRelatchTime').selectedIndex = index;
    //document.getElementById('selPetRelatchTime').selectedIndex = selectedPet.relatchTime;
}

function getSelectedPet() {
    var index = document.getElementById('selPets').selectedIndex;
    if (index == 0) return masterPet;
    return pets[index - 1];
}

function selPet_onchange(index) {
    var prevPet = (prevPetSelection == 0? masterPet : pets[prevPetSelection-1]);
    if (index > 0) {
        console.log("SELECTED PET: " + pets[index - 1].name);
    }
    else {
        console.log("SELECTED MASTER PET");
    }
    console.log("previous selected pet: " + prevPet.name);

    if (unsavedChangesOnPage) {
        showPromptYesNo("Save unsaved changes to " + prevPet.name + "?", confirmSaveUnsavedSelectedPet, returnToPrevPetSelection);
    }
    else {
        prevAccessModeSelection = getSelectedPet().accessMode;
        showSelectedPetSettings();

        prevPetSelection = index;
        madeUnsavedChanges(false);
    }
}

function confirmSaveUnsavedSelectedPet() {
    if (prevPetSelection > 0) sendToDevice(generate_SetIndividualPetSettings(pets[prevPetSelection-1])); //getSelectedPet());
    else sendToDevice(generate_SetMasterPetSettings(masterPet));
    
    showSelectedPetSettings();
    prevAccessModeSelection = getSelectedPet().accessMode;
    prevPetSelection = document.getElementById('selPets').selectedIndex;;
    madeUnsavedChanges(false);
}

function returnToPrevPetSelection() {
    console.log("jumping back to what we had selected");
    document.getElementById("selPets").selectedIndex = prevPetSelection;
    showSelectedPetSettings();
}

function selPetAccessMode_onchange() {
    prevAccessModeSelection = getSelectedPet().accessMode;
    getSelectedPet().accessMode = document.getElementById("selPetAccessMode").selectedIndex;
    if (masterIsSelected()) masterPet.accessMode++;
    showSelectedPetSettings(); //to make sure certain fields are disabled/enabled
    if (getSelectedPet().accessMode == 4) {//timer mode selected
        showPopupEditTimers(true);
    }
    else showDivPetTimerDisplay(false);
    madeUnsavedChanges(true);
}

function selPetRelatch_onchange() {
    var value = document.getElementById("selPetRelatchTime").selectedIndex + 1;
    if (value == 11) value = 15;
    else if (value == 12) value = 20;
    else if (value == 13) value = 25;
    else if (value == 14) value = 30;
    else if (value == 15) value = 40;
    else if (value == 16) value = 50;
    else if (value == 17) value = 60;
    console.log("relatch time: " + value + " seconds.");
    getSelectedPet().relatchTime = value;
    madeUnsavedChanges(true);
}

function selPetInTone_onchange() {
    var toneIndex = document.getElementById("selPetInTone").selectedIndex;
    getSelectedPet().inTone = toneIndex;
    if (toneIndex > 0) sendToDevice(generate_CmdBeep(toneIndex, 1));
    madeUnsavedChanges(true);
}

function selPetOutTone_onchange() {
    var toneIndex = document.getElementById("selPetOutTone").selectedIndex;
    getSelectedPet().outTone = toneIndex;
    if (toneIndex > 0) sendToDevice(generate_CmdBeep(toneIndex, 1));
    madeUnsavedChanges(true);
}

function btnRevertPetSettings_onclick() {
    console.log("Revert Pet Settings!");
    if (document.getElementById('selPets').selectedIndex == 0) sendToDevice(generate_GetMasterPetAccessSettings());
    else {
        sendToDevice(generate_GetIndividualPetAccessSettings(getSelectedPet().id));
        sendToDevice(generate_GetIndividualPetName(getSelectedPet().id));
    }
    madeUnsavedChanges(false);
}

function btnSavePetSettings_onclick() {
    saveSelectedPetSettings();
}

function btnPsAddPet_onclick() {
    showStep_namePet();
}

function btnPsEditTimers_onclick() {
    if (getSelectedPet().accessMode == 4) {//timer mode selected
        showPopupEditTimers(true);
    }
    else {
        console.error("Clicked to edit timers, but this pet isn't set to timer mode!");
        showDivPetTimerDisplay(false);
    }
}

function btnPsEditName_onclick() {
    //showAlert("Rename Pet not implemented."); //TODO: implement!
    if (masterIsSelected()) {
        showAlert("Master is not a pet and cannot be renamed.");
    }
    else {
        showPopupRenamePet(true, "Rename Pet:", getSelectedPet().name);
    }
}

function btnPsDeletePet_onclick() {
    if (masterIsSelected()) {
        showAlert("Master is not a pet and cannot be deleted.");
        return;
    }

    showPromptYesNo("Delete " + getSelectedPet().name + "?", confirmDeleteSelectedPet, null);
    //if (confirm("Delete " + getSelectedPet().name + "?")) {
    //    sendToDevice(generate_SetDeletePet(getSelectedPet()));
    //}
}

function confirmDeleteSelectedPet(){
    console.log("deleting pet: " + getSelectedPet().name);
    sendToDevice(generate_SetDeletePet(getSelectedPet()));
}

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

/*---------------add pets page----------------*/
function showStep_namePet() {
    hideAllInMainPanel();
    document.getElementById("tbPetName").value = "";
    document.getElementById("add-pets").style.display = 'block';
    document.getElementById("namePet").style.display = 'block';
    document.getElementById("tbPetName").focus();
}

function showStep_addPet1() {
    hideAllInMainPanel();
    document.getElementById("add-pets").style.display = 'block';
    document.getElementById("learnPet1").style.display = 'block';
}

function showStep_addPet2() {
    hideAllInMainPanel();
    document.getElementById("add-pets").style.display = 'block';
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
    btnEditPet_onclick(pets[pets.length-1].id)
}

function namePet_next() {
    if (document.getElementById("tbPetName").value.length < 1) {
        showAlert("A name must be entered!");
        return;
    }
    document.getElementById("curPetName").innerHTML = document.getElementById("tbPetName").value;
    showStep_addPet1();
}

function learnPet1_next() {
    showStep_addPet2();
}

/*--------------pet timers popup----------------*/
function refreshCanvas() {//clear & redraw time graph on canvas
    console.log("refreshCanvas() " + ctx.canvas.width + " " + ctx.canvas.height);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = "12px sans-serif";
    var startX = 20, startY = 15, endX = ctx.canvas.width - 20, endY = 15;
    var stepSize = (endX - startX) / 24;
    var circleRadius = 6;
    
    //Draw line, label & tickmarks
    drawLine(startX, startY, endX, endY, 3, 'black');
    ctx.fillStyle = 'black';
    for (var i = 0; i <= 24; i++) { //draw tickmarks
        var tickX = startX+(i*stepSize);
        drawLine(tickX, startY - 10, tickX, startY + 10, 1, 'black'); //draw tickmark
        if (i % 2 == 0) { //only draw even numbered tickmarks
            var offset = (getFormattedHour(i) > 9) ? -8 : -4; //2 digit numbers need to be scooted over a bit more to line up w/ tickmarks
            ctx.fillText(getFormattedHour(i), tickX + offset, endY + 20); 
        }
    }

    //draw lines connecting the event dots
    var eventList = getTempEventList(currentEditPet);
    for (var i = 0; i < eventList.length; i++) {
        if (i == eventList.length - 1) {//last element, draw two lines to wrap around to beginning
            drawLine(startX + (eventList[i].hour * stepSize), startY - 5, endX, startY - 5, 4, getModeColor(currentEditPet.timers[i].accessMode));//to end
            drawLine(startX, startY - 5, (eventList[0].hour+1) * stepSize, startY - 5, 4, getModeColor(currentEditPet.timers[i].accessMode)); //wrap
            //console.log("Step:" + stepSize + "    Hour:" + eventList[0].hour);
            drawDot(startX + (eventList[i].hour * stepSize), startY, circleRadius, getModeColor(eventList[i].accessMode));
        }
        else { //for all other events
            drawLine(startX + (eventList[i].hour * stepSize), startY - 5, endX, startY - 5, 4, getModeColor(currentEditPet.timers[i].accessMode));
            drawDot(startX + (eventList[i].hour * stepSize), startY, circleRadius, getModeColor(eventList[i].accessMode));
        }
    }

    //draw circles at timer change points
    /*for (var i = 0; i < 4; i++) {
        if (eventList[i].accessMode != 0xF) {
            var hr = eventList[i].hour;
            console.log("drawing dot. Mode=" + eventList[i].accessMode);
            drawDot(startX + (eventList[i].hour * stepSize), startY, circleRadius, getModeColor(eventList[i].accessMode));
        }
    }   */
}

function getTempEventList(pet) {
    var eventList = new Array();
    for (var i = 0; i < 4; i++) {
        if (pet.timers[i].accessMode != 0xF) {
            eventList.push(pet.timers[i]);
        }
    }
    eventList.sort(function(a,b){
        if(a.hour < b.hour) return -1;
        if(a.hour > b.hour) return 1;
        //if hours are same:
        return b.min- a.min;
    })
    console.log(eventList.length + " things in sorted list.");
    return eventList;
}

function getFormattedHour(hour) {
    if (door.timeFormat == Config_H.TIME_FORMAT_12H) {
        hour %= 12;
        if (hour == 0) hour = 12;
        return hour;
    }
    else return hour; //24hr format
}

function getModeColor(accessMode) {
    if (accessMode == "1") return 'blue';
    if (accessMode == "2") return 'red';
    if (accessMode == "3") return 'lime';
    return 'black';
}

function drawDot(xpos, ypos, radius, color) {
    ctx.beginPath();
    ctx.arc(xpos, ypos, radius, 0, 2 * Math.PI, false);
    ctx.lineWidth = 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'black';
    ctx.fill();
    //ctx.lineWidth = 5;
    //ctx.strokeStyle = '#003300';
    ctx.stroke();
}

function drawLine(x1, y1, x2, y2, width, color) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function refreshTimerDisplays() {
    currentEditPet.timers.sort(function(a,b){
        if(a.accessMode == 0xF) return 1;
        if(b.accessMode == 0xF) return -1;
        if(a.hour < b.hour) return -1;
        if(a.hour > b.hour) return 1;
        if(a.min < b.min) return -1;
        return 1;
    });
    for (var i = 0; i < 4; i++) {
        if (currentEditPet.timers[i].accessMode == 0) currentEditPet.timers[i].accessMode = 0xF;//master is not a valid option. change to disabled.
        var accessMode = getAccessModeName(currentEditPet.timers[i].accessMode);
        var formattedTime = getFormattedTime(currentEditPet.timers[i].hour, currentEditPet.timers[i].minute);
        if(accessMode == "---") formattedTime = accessMode; //don't print time for a disabled timer
        document.getElementById('tmrItem' + i).innerHTML = 
                  "<br /><div style='float:left; width:60%; margin-left:20px;'>" + formattedTime + " - " + accessMode + "</div>"
				+ "<div style='float:right; margin-right:20px; '>"
                + "  <button onclick='btnEditPetTimer_onclick(" + i + ")' style='border:0px; background-color:transparent; '>"
				+ "    <img src='/apps/PASSport/img/passport_UIUX_editSMALL.png' width='18'>"
				+ "  </button>"
				+ "  <button onclick='btnDeletePetTimer_onclick(" + i + ")' style='border:0px; background-color:transparent; '>"
				+ "    <img src='/apps/PASSport/img/passport_UIUX_delete.png' width='18'>"
				+ "  </button>"
				+ "</div>";
    }
    refreshCanvas();
}

function initTimerEditor() {
    regenerateSelectBoxWithNumberRange("tmrHH", 0, 23);
    regenerateSelectBoxWithNumberRange("tmrMM", 0, 59);
}

function showIndividualTimerEditor(flag) {
    if (!flag) {//hide editor
        document.getElementById("topleft_text").style.display = 'block';
        document.getElementById("topleft_editor").style.display = 'none';
    }
    else { //show editor
        document.getElementById("topleft_text").style.display = 'none';
        document.getElementById("topleft_editor").style.display = 'block';
    }
}

//in topleft div:
function btnDeletePetTimer_onclick(index) {
    console.log("Delete timer: " + index);
    currentEditPet.timers[index].hour = currentEditPet.timers[index].minute = 0;
    currentEditPet.timers[index].accessMode = 0xF;
    showIndividualTimerEditor(false);
    refreshTimerDisplays();
}

function btnEditPetTimer_onclick(index) {//edit one of the pet's 4 timers
    console.log("Edit timer: " + index);
    currentEditPet.editTimerIndex = index; //add a property to currentEditPet to remember which timer we're editing
    
    document.getElementById("tmrMM").selectedIndex = currentEditPet.timers[index].minute;
    if (door.timeFormat == Config_H.TIME_FORMAT_12H) {
        regenerateSelectBoxWithNumberRange('tmrHH', 1, 12);
        document.getElementById("tmrAmPm").style.display = 'block';
        document.getElementById("tmrAmPm").selectedIndex = (currentEditPet.timers[index].hour < 12) ? 0 : 1;
        var hrIndex = (currentEditPet.timers[index].hour % 12)-1;
        if (hrIndex <= 0) hrIndex = 11;
        document.getElementById("tmrHH").selectedIndex = hrIndex;
    } else {
        regenerateSelectBoxWithNumberRange('tmrHH', 0, 24);
        document.getElementById("tmrAmPm").style.display = 'none'; //hide am/pm box if 24hr format
        document.getElementById("tmrHH").selectedIndex = currentEditPet.timers[index].hour;
    }
    document.getElementById("tmrAccessMode").selectedIndex = currentEditPet.timers[index].accessMode - 1;
    showIndividualTimerEditor(true);
}

//in topright div:
function btnSaveTimer_onclick() {//save setting for currently selected timer
    if (document.getElementById('tmrAccessMode').selectedIndex < 0) {
        showAlert("You must choose an access mode for this time!");
        return;
    }
    console.log("Saving setting for pet's timer[" + currentEditPet.editTimerIndex + "].");
    showIndividualTimerEditor(false);
    //Save changes to our local copy:
    var tempHour = document.getElementById('tmrHH').selectedIndex;
    if (document.getElementById('tmrHH').options.length == 12) {
        //console.error("This is a 12hour combobox! We must treat it special!");
        tempHour++;
        //console.error("TEMPHOURa " + tempHour);
        if (document.getElementById('tmrAmPm').selectedIndex == 1) tempHour += 12;
        else if (tempHour == 12) tempHour = 0;
        //console.error("TEMPHOURb " + tempHour);
        if (tempHour > 24) tempHour = 0;
        if (tempHour == 24) tempHour = 12;
        //console.error("SAVE HR: " + tempHour);
    }
    currentEditPet.timers[currentEditPet.editTimerIndex].hour = tempHour;
    currentEditPet.timers[currentEditPet.editTimerIndex].minute = document.getElementById('tmrMM').selectedIndex;
    currentEditPet.timers[currentEditPet.editTimerIndex].accessMode = document.getElementById('tmrAccessMode').selectedIndex+1;

    refreshTimerDisplays();
}

//main ok/cancel buttons:
function btnEditTimerOk_onclick() {//done editing timers. save settings & close popup
    for (var i = 0, count = 0; i < 4; i++) {//count number of unset timer events
        if (currentEditPet.timers[i].accessMode == 0xF) count++; //15 = 0xF = disabled timer
        console.error("(" + currentEditPet.timers[i].accessMode + " == ---) :: " + count);
    } 
    if (count > 2) {
        showAlert("Must set at least 2 timer events!");
        return;
    }
    console.log("SAVING TEMP PETS TIMERS BACK TO ORIGINAL!");
    prevAccessModeSelection = 4;
    //unsavedChangesOnPage = true;
    madeUnsavedChanges(true);
    jQuery.extend(true, getSelectedPet().timers, currentEditPet.timers); //copy selected pet to currentEditPet so we can make temporary changes
    //getSelectedPet().timers = currentEditPet.timers;
    loadDivTimerSettings();
    showPopupEditTimers(false);
}

function btnEditTimerCancel_onclick() { //cancel editing timers. revert settings & close popup
    showPopupEditTimers(false);
    currentEditPet = {};
    getSelectedPet().accessMode = prevAccessModeSelection; //jump back to original setting
    showSelectedPetSettings(); //refresh display
}

/*--------------rename pet/door popup------------*/
function btnRenameOk_onclick() {
    showAlert("Renaming " + getSelectedPet().name + " to " + document.getElementById('tbNameEntry').value);
    getSelectedPet().name = document.getElementById('tbNameEntry').value;
    sendToDevice(generate_SetIndividualPetName(getSelectedPet()));
    showPopupRenamePet(false, "", "");
}

/*------------side panel w/ help & such------------*/
function btnSidePnlNav_onclick(pageToDisplay) {
    console.log("Changing to " + pageToDisplay);
    document.getElementById("sidePnlHome").style.display = "none";
    document.getElementById("sidePnlUpdates").style.display = "none";
    document.getElementById("sidePnlSupport").style.display = "none";
    document.getElementById("sidePnlDebug").style.display = "none";

    document.getElementById("sidePnlPetStatus_help").style.display = "none";
    document.getElementById("sidePnlPetSettings_help").style.display = "none";
    document.getElementById("sidePnlDoorSettings_help").style.display = "none";

    document.getElementById(pageToDisplay).style.display = "block";
}

function pnlSupport_btnSetupWizard_onclick() {
    window.location.href = '/apps/PASSport/PASSport_wizard.html';
}

function pnlSupport_btnFactReset_onclick() {
    //showAlert("This button is currently disabled to prevent accidental loss of data!");
    //if (confirm("Are you sure you want to reset the door to factory defaults?")) sendToDevice(generate_CmdFactoryReset());
    showPromptYesNo("Are you sure you want to reset the door to factory defaults?", confirmResetFactoryDefaults);
}

function confirmResetFactoryDefaults() {
    sendToDevice(generate_CmdFactoryReset());
}

function pnlSupport_btnReboot_onclick() {
    sendToDevice(generate_CmdReboot());
}

function pnlSupport_btnDownloadFwUpdate_onclick() {
    showAlert("Downloading software/firmware has been temporarily disabled.");
    //getLatestFwPath();
}

function pnlSupport_btnDownloadSwUpdate_onclick() {
    //showAlert("Downloading software/firmware has been temporarily disabled.\n" + swD);
    //getLatestSwPath();
    //showAlert(softwareDownloadPath);
    //window.open(softwareDownloadPath);
    sendEventToServer("open", softwareDownloadPath)
}

function pnlSupport_btnInstallFirmware_onclick() {
    console.error("ACTIVATING BOOTLOADER & RUNNING UPDATE");
    //showAlert("Install Firmware not yet implemented!");
    //sendToServer('runApplication', '.\\public\\PASSport\\Updater\\HIDBootLoader.exe');
    if (firmwareDownloadPath != "") {
        console.error("Dl path: " + firmwareDownloadPath);
        console.error(generate_CmdActivateBootloader().toString());
        sendToDevice(generate_CmdActivateBootloader());
        deviceDisconnected();
        requestConnectToDoor();
    }
    else showAlert("No internet connection detected. Check connection and try running app again.");
}

function updateFwProgressBar(percentage, text){//update progress bar and label text
    document.getElementById('mtrUpdateProgress').value = percentage;
    $('#lblUpdateProgress').html(text);
    $('#fwUpdateProgressDiv').show();
}

/*---------------------Misc...-------------------*/
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

function getPetIndex(petId) {
    for (var i = 0; i < pets.length; i++) {
        if (pets[i].id == petId) return i;
    }
     console.error("getPetIndex("+petId+") - Id not found");
     return -1; //not found
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

function showConnecting() {
    madeUnsavedChanges(false);
    hideAllInMainPanel();
    document.getElementById('Connecting').style.display = 'block';
}

function showPetStatus() {
    madeUnsavedChanges(false);
    hideAllInMainPanel();
    document.getElementById('PetStatus').style.display = 'block';
}

function showDoorSettings() {
    madeUnsavedChanges(false);
    hideAllInMainPanel();
    document.getElementById('DoorSettings').style.display = 'block';
}

function showPetSettings() {
    madeUnsavedChanges(false);
    hideAllInMainPanel();
    document.getElementById('PetSettings').style.display = 'block';
}

function showPetStatusHelp() {
    document.getElementById('sidePnlPetStatus_help').style.display = 'block';
}

function showDoorSettingsHelp() {
    document.getElementById('sidePnlDoorSettings_help').style.display = 'block';
}

function showPetSettingsHelp() {
    document.getElementById('sidePnlPetSettings_help').style.display = 'block';
}

function hideAllInMainPanel() {
    document.getElementById('Connecting').style.display = 'none';
    document.getElementById('PetStatus').style.display = 'none';
    document.getElementById('DoorSettings').style.display = 'none';
    document.getElementById('PetSettings').style.display = 'none';

    document.getElementById('namePet').style.display = 'none';
    document.getElementById('add-pets').style.display = 'none';
    document.getElementById('learnPet1').style.display = 'none';
    document.getElementById('learnPet2').style.display = 'none';
}

function showPopupRenamePet(flag, headerText, editText) {
    if (flag) {
        document.getElementById('PopUpText').value = headerText;
        document.getElementById('tbNameEntry').value = editText;
        document.getElementById('PopUpRename').style.display = 'block';
        document.getElementById('tbNameEntry').focus();
    }
    else document.getElementById('PopUpRename').style.display = 'none';
}

function showPopupEditTimers(flag) {
    if (flag) {
        jQuery.extend(true, currentEditPet, getSelectedPet()); //copy selected pet to currentEditPet so we can make temporary changes
        refreshTimerDisplays();
        showIndividualTimerEditor(false);
        document.getElementById('PopUpTimerEditor').style.display = 'block';
    }
    else document.getElementById('PopUpTimerEditor').style.display = 'none';
}

function isConnected() {
    if (document.getElementById("Connecting").style.display != "none") return false; //not connected
    return true;
}

function madeUnsavedChanges(flag) {
    unsavedChangesOnPage = flag;
    if (flag) {//show "unsaved changes were made"
        document.getElementById("btnRevertDoorSettings").src = "/apps/PASSport/img/passport_UIUX_cancel_BUTTON_IDLE.png";
        document.getElementById("btnSaveDoorSettings").src = "/apps/PASSport/img/passport_UIUX_done_BUTTON_IDLE.png";
        document.getElementById("btnRevertPetSettings").src = "/apps/PASSport/img/passport_UIUX_cancel_BUTTON_IDLE.png";
        document.getElementById("btnSavePetSettings").src = "/apps/PASSport/img/passport_UIUX_done_BUTTON_IDLE.png";
    }
    else {//show "no unsaved changes were made"
        unsavedTimeChanges = false;
        document.getElementById("btnRevertDoorSettings").src = "/apps/PASSport/img/passport_UIUX_cancel_BUTTON_IDLE_gray.png";
        document.getElementById("btnSaveDoorSettings").src = "/apps/PASSport/img/passport_UIUX_done_BUTTON_IDLE_gray.png";
        document.getElementById("btnRevertPetSettings").src = "/apps/PASSport/img/passport_UIUX_cancel_BUTTON_IDLE_gray.png";
        document.getElementById("btnSavePetSettings").src = "/apps/PASSport/img/passport_UIUX_done_BUTTON_IDLE_gray.png";
    }
}

function refreshPetIds() {
    for (var i = 0; i < pets.length; i++) {
        pets[i].id = i;
    }
}

function autoStartFirmwareUpdate(){
    sendToDevice(generate_CmdActivateBootloader());

    btnSidePnlNav_onclick("sidePnlUpdates");
    var eventData = {
        url: firmwareDownloadPath,
    }
    if(firmwareDownloadPath == ""){
        showAlert("An internet connection was not detected. If one is available, restart this app and try again.");
        return;
    }
    //sendEventToServer('beginFirmwareUpdate', eventData);
    $("#fwUpdateProgressDiv").show();
    $('#btnInstallFwUpdate').hide();
    //setTimeout(function(){showAlert("NOTE TO SELF: I'm using a local copy of firmware file for testing. NOT using the one we just downloaded from the web because that's a super old copy.")}, 10000);
    deviceDisconnected();
    updateFwProgressBar(0, "Preparing for update...");
    requestConnectToDoor();
}

function checkIsWindows(){
    //var OSName="Unknown OS";
    if (navigator.appVersion.indexOf("Win")!=-1) return true; //OSName="Windows";
    return false;
    //if (navigator.appVersion.indexOf("Mac")!=-1) OSName="MacOS";
    //if (navigator.appVersion.indexOf("X11")!=-1) OSName="UNIX";
    //if (navigator.appVersion.indexOf("Linux")!=-1) OSName="Linux";
}

/*----------------debug----------------*/
function displayString(msg) { //for testing, displays text in the textDisplay element of the page
    var element = document.getElementById('textDisplay').innerHTML = msg;
}

function btnTone_Clicked() {
    displayString("Requested play tone. Response will appear here.");
    sendToDevice(generate_CmdBeep(5, 1));
}

function btnPower_Clicked() {
    displayString("Requested power mode settings. Response will appear here.");
    sendToDevice(generate_GetPowerModeSettings());
}


