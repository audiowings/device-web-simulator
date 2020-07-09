/* global Promise, fetch, i */

/*
A few notes
- The device will ship with a selection of genre based playlist files and related audio files stored locally
- The device will have a config file
- One of the config params will be 'activated' (0 or 1)

- When activated = 0
-- If the user presses load playlist, 
--- He will be asked to choose a genre
--- Once a genre is selected, the related device playlist will start playing

- The user will activate the device via the Audiowings portal which stores information about the user
- During activation, the user will link the device to a single primary content provider account such as Tidal or Spotify or Google Music
- Once activation is complete and a content provider is linked, the 'activated' param on the device will be updated to 1

- When activated = 1
-- If the user long-presses load playlist, 
--- All user primary content provider playlists information will be downloaded to the device
--- The user will be asked to select a playlist
--- Once a playlist is selected, the list and the audio files will be downloaded to the device and played
*/


const PROXY_SERVER = location.hostname + ':3000';
const MAC_ADDRESS = "FF-01-25-79-C7-EC";
const DEVICE_CONF_FILE = '/config/config.json';
const LOCAL_PLAYLISTS = '/playlists/basic-playlists.json';
const PROVIDERS = ["AudioWings", "Tidal", "Spotify"];
const GENRES = ["Hip Hop / Rap", "R&B / Soul", "Pop", "Rock", "Alternative", "Reggae"];
const SELECT_PROMPT_HEADER = 'Answer "Yes" or "No"';

const LONG_PRESS_TIME = 1000;

// Can be accessed as
// var topic = topicEnum.GENRE;
// var genre = topicEnum.properties[topic].options[i]
let topicEnum = {
    GENRE: 1,
    PROVIDER: 2,
    PLAYLIST: 3,
    properties: {
        1: {
            promptHeader: "Select a music genre",
            promptAction: "Would you like to listen to some",
            options: GENRES
        },
        2: {
            promptHeader: "Select your provider",
            promptAction: "Connect to",
            options: PROVIDERS
        },
        3: {
            promptHeader: "Select a playlist",
            promptAction: "Do you want to hear playlist:",
            options: []
        }
    }
};

let hardwareId;
let deviceActivated = false;
let deviceConnected = false;

// HTML elements
let confBoxOverlay;
let confBox;
let confBoxHeader;

let audio;
let logo;

let connectButton;
let playPauseButton;
let pauseButton;
let ejectButton;

let mouseDownTime;

let currentTracklist;

let dialogPromptHeader;
let dialogPromptAction;
let dialogYesButton;
let dialogNoButton;
let divDeviceInfo

function status(response) {
    if (response.status >= 200 && response.status < 300) {
        return Promise.resolve(response);
    } else {
        return Promise.reject(new Error(response.statusText));
    }
}


async function getHardwareId() {
    let deviceInfo = await getJsonFromFile(DEVICE_CONF_FILE);
    return deviceInfo['hardwareId'];
}

async function isDeviceActivated() {
    let deviceInfo = await getJsonFromFile(DEVICE_CONF_FILE);
    return deviceInfo['activated'] === 1;
}


function dragElement(elmnt) {
    var pos1 = 0,
        pos2 = 0,
        pos3 = 0,
        pos4 = 0;
    if (document.getElementById(elmnt.id + "-header")) {
        /* if present, the header is where you move the DIV from:*/
        document.getElementById(elmnt.id + "-header").onmousedown = dragMouseDown;
    } else {
        /* otherwise, move the DIV from anywhere inside the DIV:*/
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        /* stop moving when mouse button is released:*/
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function getPlaylistPath(playlistId) {
    //Get playlist index JSON
    return getJsonFromFile(LOCAL_PLAYLISTS)
        .then((playlistIndexJson) => {
            let playlists = playlistIndexJson.playlists;
            for (i in playlists) {
                //  console.log('Playlist Path = ', playlistIndexJson.playlists[i].path);
                if (playlists[i].id === playlistId) {
                    return playlists[i].path;
                }
            }
        }).catch(error => console.log(error));
}

function getPlaylistJson(playlistId) {
    return getPlaylistPath(playlistId)
        .then(playlistPath => getJsonFromFile(playlistPath));
}

// getPlaylistJson(2).then(playlistJson => console.log(playlistJson))
function formatMSS(s) {
    return (s - (s %= 60)) / 60 + (9 < s ? ':' : ':0') + s
}

function displayPlaylist(playlistData) {

    tracklist.innerHTML = "";
    playlistData.items.forEach((track, index) => {
        let trPlaylistItem = document.createElement("tr");

        let tdTrackNo = document.createElement("td");
        let trackNo = Number(Number(index) + 1).toString().padStart(2, "0");
        tdTrackNo.appendChild(document.createTextNode(trackNo));

        let tdTitle = document.createElement("td");
        tdTitle.appendChild(document.createTextNode(track.item.title));

        let tdArtist = document.createElement("td");
        tdArtist.appendChild(document.createTextNode(track.item.artist.name));

        let tdLength = document.createElement("td");
        tdLength.appendChild(document.createTextNode(formatMSS(track.item.duration)));

        let tdProvider = document.createElement("td");
        console.log(`Provider ID = ${track.providerId}`);
        tdProvider.appendChild(document.createTextNode(PROVIDERS[track.providerId]));

        let tdSource = document.createElement("td");
        tdSource.appendChild(document.createTextNode(`DL`));

        trPlaylistItem.appendChild(tdTrackNo);
        trPlaylistItem.appendChild(tdTitle);
        trPlaylistItem.appendChild(tdArtist);
        trPlaylistItem.appendChild(tdLength);
        trPlaylistItem.appendChild(tdProvider);
        trPlaylistItem.appendChild(tdSource);

        tracklist.appendChild(trPlaylistItem);
    })
    audio.innerHTML = `<source src='${playlistData.items[0].item.path}' type='audio/mp3'>`;

}

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}



// Get a playlist from content provider via DMS
function getPlaylist(provider, playlistId) {
    let playlistRequest = new Request(`http://${PROXY_SERVER}/playlist/?playlistId=${playlistId}`);
    let headers = playlistRequest.headers;
    headers.append('X-Audiowings-DeviceId', MAC_ADDRESS);
    return fetch(playlistRequest)
        .then(status)
        .then(response => response.json())
        .catch(error => console.log(':( Request failed', error));
}

async function getLocalPlaylist(path) {
    return await getJsonFromFile(path)
}

// Get all playlists from content provider via DMS
function getProviderPlaylists() {
    let playlistsRequest = new Request(`http://${PROXY_SERVER}/playlists/`);
    let headers = playlistsRequest.headers;
    headers.append('X-Audiowings-DeviceId', MAC_ADDRESS);
    return fetch(playlistsRequest)
        .then(status)
        .then(response => response.json())
        .catch(error => console.log(':( Request failed', error));
}

async function getLocalPlaylists() {
    return await getJsonFromFile(LOCAL_PLAYLISTS)
}

function getPlaylists(provider) {
    provider ? getProviderPlaylists() : getLocalPlaylists()
}

function showDialogPrompt(topic) {
    let optionIndex = 0;
    let promptHeaderText = topicEnum.properties[topic].promptHeader;
    let promptActionText = topicEnum.properties[topic].promptAction;
    let promptOptionText;
    let optionsLength;
    let playlists;

    confBoxOverlay.style.display = "block";
    dialogPromptHeader.innerText = promptHeaderText;
    switch (topic) {
        case topicEnum.PLAYLIST:
            connectButton.checked ? getProviderPlaylists() : getLocalPlaylists()
                .then($playlists => {
                    playlists = $playlists
                    optionsLength = playlists.items.length;
                    dialogPromptAction.innerText = `${promptActionText} ${playlists.items[optionIndex].name}`;
                });
            break;

        default:
            promptOptionText = topicEnum.properties[topic].options[optionIndex];
            optionsLength = topicEnum.properties[topic].options.length;
            dialogPromptAction.innerText = `${promptActionText} ${promptOptionText}`;
    }

    dialogYesButton.onclick = function () {
        confBoxOverlay.style.display = "none";
        switch (topic) {
            case topicEnum.PLAYLIST: {
                let playlistId = playlists.items[optionIndex].playlistId;
                let playlistPath = playlists.items[optionIndex].path;
                let playlistName = playlists.items[optionIndex].name;
                // let providerId = playlists.items[optionIndex].providerId;
                connectButton.checked ? getProviderPlaylist('tidal', playlistId) : getLocalPlaylist(playlistPath)
                    .then(playlistData => {
                        console.log('Playlist Data... ', playlistData);
                        displayPlaylist(playlistData)

                    });

                break;
            }
            case topicEnum.GENRE: {
                break;
            }
            case topicEnum.PROVIDER: {
                break;
            }
        }
    }

    dialogNoButton.onclick = function () {
        optionIndex++;
        // If we get to the end of the list reset the index to 0 to loop around again
        if (optionIndex === optionsLength) {
            optionIndex = 0;
        }
        switch (topic) {
            case topicEnum.PLAYLIST: {
                promptOptionText = playlists.items[optionIndex].name;
                break;
            }
            case topicEnum.GENRE:
            case topicEnum.PROVIDER: {
                promptOptionText = topicEnum.properties[topic].options[optionIndex];
                break;
            }
        }
        dialogPromptAction.innerText = `${promptActionText} ${promptOptionText}`;
        return false;
    };

    dragElement(confBox);
}


let mouseDownAction = function (e) {
    mouseDownTime = new Date().getTime();
    this.classList.add("longpress");
    let pTimer = setTimeout(function () {
    }, LONG_PRESS_TIME);
}

let mouseUpAction = function () {
    let mouseUpTime = new Date().getTime();
    this.classList.remove("longpress");
    switch (this) {
        case ejectButton:
            if (mouseUpTime - mouseDownTime < LONG_PRESS_TIME) { // Short click
                audio.currentTime = 0;
                showDialogPrompt(topicEnum.PLAYLIST);
            } else { // Long press

            }
    }
}

function playAudio(delay) {
    setTimeout(
        () => {
            audio.play();
            playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
        },
        delay
    )
}

function connectDms() {
    let connectRequest = new Request(`http://${PROXY_SERVER}/connect/`);
    let headers = connectRequest.headers;
    headers.append('X-Audiowings-DeviceId', MAC_ADDRESS);
    return fetch(connectRequest)
        .then(response => response.json())
        .then(userInfo => { return userInfo })
        .catch(error => console.log('User not found', error));
}

function getJsonFromFile(path) {
    return fetch(path)
        .then(status)
        .then(response => response.json())
        .catch(error => console.log(':( Request failed', error));
}

function displayDeviceInfo(isConnected, provider) {
    getJsonFromFile(DEVICE_CONF_FILE)
        .then(function (deviceInfo) {
            hardwareId = deviceInfo['hardwareId'];
            deviceActivated = deviceInfo['activated'] === 1;
            divDeviceInfo.innerHTML = `Device ID : ${hardwareId} Connected : ${isConnected}. Default provider : ${provider}`;
        }).catch(error => console.log(error));
}

$(document).ready(() => {

    console.log('Document ready...');

    dialogPromptHeader = document.getElementById('dialog-prompt-header');
    dialogPromptAction = document.getElementById('dialog-prompt-action');
    dialogYesButton = document.getElementById('dialog-yes-button');
    dialogNoButton = document.getElementById('dialog-no-button');
    audio = document.getElementById("audio");
    divDeviceInfo = document.getElementById("device-info");
    confBoxOverlay = document.getElementById('dialog-overlay');
    confBox = document.getElementById("dialog-prompt");
    confBoxHeader = document.getElementById("id-confrmdiv-header");
    logo = document.getElementById("logo");
    connectButton = document.getElementById("power-button");
    playPauseButton = document.getElementById("play-pause-button");
    ejectButton = document.getElementById("eject-button");
    tracklist = document.getElementById("tracklist");

    ejectButton.addEventListener("mousedown", mouseDownAction);
    ejectButton.addEventListener("mouseup", mouseUpAction);

    window.onclick = (event) => {
        if (event.target === confBoxOverlay) {
            confBoxOverlay.style.display = "none";
        }
    };

    connectButton.onclick = (() => {
        if (deviceConnected) {
            deviceConnected = false
            displayDeviceInfo(deviceConnected)
        }
        else {
            connectDms().then(userInfo => {
                deviceConnected = (userInfo === undefined) ? false : true
                displayDeviceInfo(deviceConnected, userInfo.defaultProvider)
                connectButton.checked = deviceConnected
            })
        }

    })


    playPauseButton.onclick = (() => {
        if (audio.readyState > 3) {
            if (audio.paused) {
                playAudio(0);
            } else {
                audio.pause();
                playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
            }
        }
    });

    playPauseButton.ondblclick = () => {
        audio.currentTime = 0;
    }

    // var providerUrl = PROXY_SERVER + "?provider=tidal";

    displayDeviceInfo(deviceConnected);

});
