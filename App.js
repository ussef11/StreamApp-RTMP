import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Button,
  Dimensions,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  findNodeHandle,
} from 'react-native';
import {NodePlayerView, NodeCameraView} from 'react-native-nodemediaclient';
import {
  useCameraDevices,
  Camera,
  FileSystem,
  Permissions,
  useCameraFormat,
} from 'react-native-vision-camera';

import RNRestart from 'react-native-restart';
import RNFS from 'react-native-fs';

import Video from 'react-native-video';
import {PERMISSIONS, RESULTS, check, request} from 'react-native-permissions';
import {execute, RNFFmpeg} from 'react-native-ffmpeg';

const App = () => {
  const vpRef = useRef();

  const saveFileToExternalStorage = async value => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Permission to access external storage',
          message: 'We need your permission to access your external storage',
          buttonPositive: 'Ok',
          buttonNegative: 'Cancel',
        },
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        const externalDirectoryPath = RNFS.ExternalStorageDirectoryPath;

        const directoryName = 'MyguidData';
        const directoryPath = `${externalDirectoryPath}/${directoryName}`;
        await RNFS.mkdir(directoryPath);

        const fileName = 'record.txt';
        const filePath = `${directoryPath}/${fileName}`;

        await RNFS.writeFile(filePath, value, 'utf8');

        console.log('File saved successfully:', filePath);
      } else {
        console.log('External storage permission denied.');
      }
    } catch (error) {
      console.error('Error saving file:', error);
    }
  };

  const readTextFromFile = async () => {
    try {
      const externalDirectoryPath = RNFS.ExternalStorageDirectoryPath;
      const directoryName = 'MyguidData';
      const fileName = 'record.txt';
      const filePath = `${externalDirectoryPath}/${directoryName}/${fileName}`;

      const fileExists = await RNFS.exists(filePath);
      if (!fileExists) {
        console.log('File does not exist at path:', filePath);
        return null;
      }

      const fileContent = await RNFS.readFile(filePath, 'utf8');
      console.log('File content:', fileContent);
      return fileContent;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  };

  const config = {
    cameraConfig: {
      cameraId: 1,
      cameraFrontMirror: false,
    },
    videoConfig: {
      preset: 4,
      bitrate: 2000000,
      profile: 2,
      fps: 30,
      videoFrontMirror: true,
    },
    audioConfig: {
      bitrate: 128000,
      profile: 1,
      samplerate: 44100,
    },
  };
  const handleStatus = event => {
    console.log('RTMP Status:', event);
  };
  const [FinishCompressed, setFinishCompressed] = useState(false);

  const startStream = async () => {
    await saveFileToExternalStorage('true');
    await stopRecording();
  };

  useEffect(() => {
    if (FinishCompressed) {
      console.log('restart');
      RNRestart.restart();
    }
  }, [FinishCompressed]);

  const [isStream, setIsStream] = useState();

  useEffect(() => {
    const _StartStream = async () => {
      const fileContent = await readTextFromFile();
      console.log('File content:', fileContent);
      if (fileContent !== null) {
        setIsStream(fileContent);
      } else {
        setIsStream('false');
        await startRecording();
      }
      if (fileContent == 'true') {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        try {
          vpRef.current.start();
        } catch (error) {
          console.error('Error starting stream:', error);
        }
      } else if (fileContent == 'false') {
        await startRecording();
      }
    };

    _StartStream();
  }, []);

  const stopStream = async () => {
    await vpRef.current.stop();
    await startRecording();
    saveFileToExternalStorage('false');
    RNRestart.restart();
  };
  const restart = () => {};
  const readtext = () => {};

  const streamKey = '5b2a4a75-86c2-177c-72a2-45ab2b5e2583';
  const url = `rtmp://192.168.100.50:1935/live/1234`;
  const devices = useCameraDevices();
  const device = devices[1];

  const cameraRef = useRef();

  const [isRecording, setIsRecording] = useState(false);
  const [videoPath, setVideoPath] = useState('');

  const startRecording = async () => {
    //stopStream();
    console.log('recording .........');
    // await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    // await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.AUDIO);
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Permission to access external storage',
        message: 'We need your permission to access your external storage',
        buttonPositive: 'Ok',
        buttonNegative: 'Cancel',
      },
    );

    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      try {
        setIsRecording(true);

        const externalDirectoryPath = RNFS.ExternalStorageDirectoryPath;
        const directoryName = 'AllRecord';
        const fileName = 'video.mp4';
        const filePath = `${externalDirectoryPath}/${directoryName}/${fileName}`;

        await cameraRef.current.startRecording({
          videoBitrate: 500000,
          maxDuration: 10,
          //maxFileSize: 100 * 1024 * 1024,
          outputPath: filePath,
          format: {format},
          onRecordingFinished: async video => {
            console.log('Recording finished:', video);
            await compressVideoAndSave(video.path);
          },
          onRecordingError: error => console.error(error),
        });

        console.log('startRecording');
      } catch (err) {
        console.log(err);
      }
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    await cameraRef.current.stopRecording();
    console.log('Stop Recording');
  };

  const compressVideoAndSave = async inputPath => {
    setFinishCompressed(false);
    const outputDir = `${RNFS.ExternalStorageDirectoryPath}/AllRecord`;
    const outputFileName = 'compressed_video.mp4';
    const outputPath = `${outputDir}/${outputFileName}`;
    console.log('inputPath', inputPath);
    // const command = `ffmpeg -y -threads 1 -i ${inputPath} -c:v libx264 -preset veryfast -c:a aac 
    // -max_muxing_queue_size 1024 ${outputPath}`;

     // const command = `-y -i ${inputPath} -c:v libx264 -crf 28 -vf scale=426:240 -preset ultrafast ${outputPath}`;
      const command = `-i ${inputPath} -vf  scale=426:240  -b:v 500k ${outputPath}`;
    try {
      const result = await RNFFmpeg.executeAsync(
        command,
        completedExecution => {
          if (completedExecution.returnCode === 0) {
            saveVideoToExternalStorage(outputPath);
            console.log('FFmpeg process completed successfully');
            setFinishCompressed(true);
          } else {
            console.log(
              `FFmpeg process failed with rc=${completedExecution.returnCode}.`,
            );
          }
        },
      ).then(executionId =>
        console.log(
          `Async FFmpeg process started with executionId ${executionId}.`,
        ),
      );

      console.log('FFmpeg output:', result);
      console.log('Video compression successful');
    } catch (error) {
      console.error('Error compressing video:', error);
    }
  };
  const saveVideoToExternalStorage = async videoPath => {
    console.log(5555555555555555555555555555);
    try {
      const currentDate = new Date();
      const formattedDate = currentDate.toISOString().split('T')[0];
      const formattedTime = currentDate
        .toTimeString()
        .split(' ')[0]
        .replace(/:/g, '-');
      const fileName = `${formattedDate}_${formattedTime}.mp4`;
      const externalDirectoryPath = RNFS.ExternalStorageDirectoryPath;
      const directoryName = 'AllRecord';
      const destinationPath = `${externalDirectoryPath}/${directoryName}/${fileName}`;

      const directoryExists = await RNFS.exists(
        `${externalDirectoryPath}/${directoryName}`,
      );
      if (!directoryExists) {
        await RNFS.mkdir(`${externalDirectoryPath}/${directoryName}`);
      }

      await RNFS.moveFile(videoPath, destinationPath);
      console.log('Video saved to external storage:', destinationPath);
    } catch (error) {
      console.error('Error saving video to external storage:', error);
    }
  };

  const format = useCameraFormat(device, [
    {
      photoAspectRatio: 4 / 3,
    },
    {photoResolution: '480p'},
    {videoAspectRatio: 4 / 3},
    {videoResolution: {height: 1944, width: 2592}},
    {width: 1000, height: 1000},
  ]);

  return (
    <View style={{flex: 1}}>
      <View>
        <Button title="Start Stream" onPress={startStream} />
        <Button title="Stop Stream" onPress={stopStream} />
        <Button title="Start Recording" onPress={startRecording} />
        <Button title="Stop Recording" onPress={stopRecording} />
        <Button
          title="Save File to External Storage"
          onPress={saveVideoToExternalStorage}
        />
        {/* <View style={{height: 200}}>
          <Camera
            style={{flex: 1}}
            ref={cameraRef}
            device={devices[1]}
            isActive={true}
          />
        </View> */}

        <>
          {isStream == 'false' ? (
            <View style={{height: 200}}>
              {/* {console.log('isStream', isStream)} */}
              {console.log(format)}
              <Camera
                quality="360p"
                style={{flex: 1}}
                device={device}
                isActive={true}
                ref={cameraRef}
                video={true}
                orientation="landscape-left"
                format={format}
              />
              {videoPath !== '' && (
                <View style={styles.videoPlayer}>
                  <Video
                    source={{uri: videoPath}}
                    style={styles.videoPlayer}
                    controls
                  />
                </View>
              )}
            </View>
          ) : (
            <NodeCameraView
              style={{height: 440}}
              ref={vpRef}
              outputUrl={url}
              camera={config.cameraConfig}
              audio={config.audioConfig}
              video={config.videoConfig}
              autopreview={true}
              onStatus={(code, msg) => {
                console.log('onStatus=' + code + ' msg=' + msg);
              }}
            />
          )}
        </>
      </View>

      {/* <NodePlayerView
        style={{height: 200}}
        ref={vpRef}
        outputUrl={'rtmp://192.168.100.50:1935/live/1234'} // Corrected outputUrl
        camera={{cameraId: 0, cameraFrontMirror: true}}
        audio={{bitrate: 32000, profile: 1, samplerate: 44100}}
        video={{
          preset: 12,
          bitrate: 400000,
          profile: 1,
          fps: 15,
          videoFrontMirror: false,
        }}
        scaleMode={'ScaleAspectFit'}
        bufferTime={300}
        maxBufferTime={1000}
        autoplay={false}
        autopreview={true}
        onStatus={event => handleStatus(event)}
      /> */}
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  recordButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'red',
    padding: 20,
    alignItems: 'center',
  },
  recordButtonText: {
    fontSize: 18,
    color: '#fff',
  },
  videoPlayer: {
    flex: 1,
    marginTop: 20,
  },
});
export default App;
