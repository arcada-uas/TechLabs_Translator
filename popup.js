// Configure host and port here (edge device running whisper-live)
const host = "1.2.3.4";
const port = "1234";
let selectedLanguage = "sv";
let selectedTask = "transcribe";
let selectedModelSize = "large-v3";

document.addEventListener("DOMContentLoaded", function () {
  const startButton = document.getElementById("startCapture");
  const stopButton = document.getElementById("stopCapture");
  const headerBox = document.getElementsByClassName("header")[0];


  /* ##################### */
  /*      content.js!      */
  /* ##################### */


  let socket = null;
  let isCapturing = false;
  let mediaStream = null;
  let audioContext = null;
  let scriptProcessor = null;
  let language = null;
  let isPaused = false;
  const mediaElements = document.querySelectorAll("video, audio");
  mediaElements.forEach((mediaElement) => {
    mediaElement.addEventListener("play", handlePlaybackStateChange);
    mediaElement.addEventListener("pause", handlePlaybackStateChange);
  });

  function handlePlaybackStateChange(event) {
    isPaused = event.target.paused;
  }

  function generateUUID() {
    let dt = new Date().getTime();
    const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (dt + Math.random() * 16) % 16 | 0;
        dt = Math.floor(dt / 16);
        return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
      });
    return uuid;
  }

  /**
   * Resamples the audio data to a target sample rate of 16kHz.
   * @param {Array|ArrayBuffer|TypedArray} audioData - The input audio data.
   * @param {number} [origSampleRate=44100] - The original sample rate of the audio data.
   * @returns {Float32Array} The resampled audio data at 16kHz.
   */
  function resampleTo16kHZ(audioData, origSampleRate = 44100) {
    // Convert the audio data to a Float32Array
    const data = new Float32Array(audioData);

    // Calculate the desired length of the resampled data
    const targetLength = Math.round(data.length * (16000 / origSampleRate));

    // Create a new Float32Array for the resampled data
    const resampledData = new Float32Array(targetLength);

    // Calculate the spring factor and initialize the first and last values
    const springFactor = (data.length - 1) / (targetLength - 1);
    resampledData[0] = data[0];
    resampledData[targetLength - 1] = data[data.length - 1];

    // Resample the audio data
    for (let i = 1; i < targetLength - 1; i++) {
      const index = i * springFactor;
      const leftIndex = Math.floor(index).toFixed();
      const rightIndex = Math.ceil(index).toFixed();
      const fraction = index - leftIndex;
      resampledData[i] = data[leftIndex] + (data[rightIndex] - data[leftIndex]) * fraction;
    }

    // Return the resampled data
    return resampledData;
  }

  function startRecording(data) {
    socket = new WebSocket(`ws://${data.host}:${data.port}/`);
    language = data.language;

    const uuid = generateUUID();
    socket.onopen = function (e) {
      socket.send(
        JSON.stringify({
          uid: uuid,
          language: data.language,
          task: data.task,
          model: data.modelSize
        })
      );
    };

    let isServerReady = false;
    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data["uid"] !== uuid) return;
      if (data["status"] === "WAIT") {
        console.log("WAIT!");
        return;
      }
      if (!isServerReady && data["message"] === "SERVER_READY") {
        isServerReady = true;
        console.log("SERVER READY!");
        document.querySelector(".patient:nth-last-of-type(2)").firstChild.textContent = "Lyssnar..."
        stopButton.style.backgroundColor = "red";
        stopButton.style.color = "white";
        stopButton.textContent = "Lyssnar...";
        return;
      }
      if (language === null) {
        language = data["language"];
        console.log("Language: " + language);
        return;
      }
      if (data["message"] === "DISCONNECT") {
        console.log("DISCONNECTED");
        return;
      }

      showTranscript(data);
    };

    // Access the audio stream from the current tab
    navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function (stream) {
        // Create a new MediaRecorder instance
        const audioDataCache = [];
        audioContext = new AudioContext();
        mediaStream = audioContext.createMediaStreamSource(stream);
        recorder = audioContext.createScriptProcessor(4096, 1, 1);

        recorder.onaudioprocess = async (event) => {
          if (!audioContext || !isCapturing || !isServerReady || isPaused)
            return;

          const inputData = event.inputBuffer.getChannelData(0);
          const audioData16kHz = resampleTo16kHZ(inputData, audioContext.sampleRate);
          audioDataCache.push(inputData);
          socket.send(audioData16kHz);
        };

        // Prevent page mute
        mediaStream.connect(recorder);
        recorder.connect(audioContext.destination);
      })
  }

  var elem_container = null;
  var elem_text = null;
  var segments = [];
  var text_segments = [];



  function init_element() {
    elem_container = document.querySelector(".patient:nth-last-of-type(2)");
    elem_container.classList.add("patient");
    elem_container.innerHTML = "";

    for (var i = 0; i < 4; i++) {
      elem_text = document.createElement("span");
      elem_text.id = "t" + i + speechBubble;
      elem_container.appendChild(elem_text);

      if (i == 3) {
        elem_text.style.top = "-1000px";
      }
    }
  }

  function getStyle(el, styleProp) {
    var x = document.getElementById(el + speechBubble);
    if (x.currentStyle) 
      var y = x.currentStyle[styleProp];
    else if (window.getComputedStyle)
      var y = document.defaultView.getComputedStyle(x, null).getPropertyValue(styleProp);
    return y;
  }

  function get_lines(elem, line_height) {
    var divHeight = elem.offsetHeight;
    var lines = divHeight / line_height;

    var original_text = elem.innerHTML;

    var words = original_text.split(" ");
    var segments = [];
    var current_lines = 1;
    var segment = "";
    var segment_len = 0;
    for (var i = 0; i < words.length; i++) {
      segment += words[i] + " ";
      elem.innerHTML = segment;
      divHeight = elem.offsetHeight;

      if ((divHeight / line_height) > current_lines) {
        var line_segment = segment.substring(segment_len, segment.length - 1 - words[i].length - 1);
        segments.push(line_segment);
        segment_len += line_segment.length + 1;
        current_lines++;
      }
    }

    var line_segment = segment.substring(segment_len, segment.length - 1);
    segments.push(line_segment);

    elem.innerHTML = original_text;

    return segments;
  }

  startButton.addEventListener("click", function () {
    console.log("User tried to START transcription");
    // Add a new speech bubble
    if (speechBubble>1) {
      previous_transcript = document.querySelector(".patient:nth-last-of-type(2)");
      const new_container = document.createElement("div");
      new_container.id = "transcription";
      new_container.classList.add("patient");
      new_container.innerText = "Initierar..."
      previous_transcript.insertAdjacentElement("afterend", new_container);
    }else{
      previous_transcript = document.querySelector(".patient:nth-last-of-type(2)");
      previous_transcript.firstChild.textContent = "Initierar...";

    }
    // Toggle stopbutton
    stopButton.toggleAttribute("disabled");
    const request = {
      action: "startCapture",
      data: {
        host: host,
        port: port,
        language: selectedLanguage,
        task: selectedTask,
        modelSize: selectedModelSize,
      }
    };
    isCapturing = true;
    startRecording(request.data);
    // Style stopbutton initializing
    stopButton.style.backgroundColor = "black";
    stopButton.style.color = "white";
    stopButton.textContent = "Initierar...";
    // Swap startbutton to stopbutton
    startButton.style.display = "none";
    stopButton.style.display = "block";
  });

  stopButton.addEventListener("click", function () {
    console.log("User tried to STOP transcription");
    isCapturing = false;
    if (socket) {
      socket.close();
      socket = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
      mediaStream = null;
      recorder = null;
    }
    // Swap startbutton to stopbutton
    stopButton.style.display = "none";
    startButton.style.display = "block";
    speechBubble++;
  });

  // Keep track of amount of speech bubbles
  var speechBubble = 1;
  function showTranscript(data) {
    if (!isCapturing) return;
    init_element();
    //console.log(data);
    message = data["segments"];

    var text = "";
    for (var i = 0; i < message.length; i++) {
      text += message[i].text + " ";
    }
    text = text.replace(/(\r\n|\n|\r)/gm, "");

    var elem = document.querySelectorAll("#t3" + speechBubble);
    elem.innerHTML = text;

    var line_height_style = getStyle("t3", "line-height");
    var line_height = parseInt(
      line_height_style.substring(0, line_height_style.length - 2),
    );
    var divHeight = elem.offsetHeight;
    var lines = divHeight / line_height;

    text_segments = [];
    text_segments = get_lines(elem, line_height);

    elem.innerHTML = "";

    if (text_segments.length > 2) {
      for (var i = 0; i < 3; i++) {
        document.getElementById("t" + i + speechBubble).innerHTML =
          text_segments[text_segments.length - 3 + i + speechBubble];
      }
    } else {
      for (var i = 0; i < 3; i++) {
        document.getElementById("t" + i + speechBubble).innerHTML = "";
      }
    }

    if (text_segments.length <= 2) {
      for (var i = 0; i < text_segments.length; i++) {
        document.getElementById("t" + i + speechBubble).innerHTML = text_segments[i];
      }
    } else {
      for (var i = 0; i < 3; i++) {
        document.getElementById("t" + i + speechBubble).innerHTML =
          text_segments[text_segments.length - 3 + i];
      }
    }

    for (var i = 1; i < 3; i++) {
      var parent_elem = document.getElementById("t" + (i - 1) + speechBubble);
      var elem = document.getElementById("t" + i + speechBubble);
      elem.style.top = parent_elem.offsetHeight + parent_elem.offsetTop + "px";
    }
  }
});
