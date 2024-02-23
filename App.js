import React, {useState, useEffect} from 'react';
import {
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import {atob} from 'react-native-quick-base64';

import BluetoothStateManager from 'react-native-bluetooth-state-manager';

const App = () => {
  // const [data, setData] = useState('No data');
  const [bleManager, setBleManager] = useState(null);
  const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // Characteristic UUID to read
  const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

  useEffect(() => {
    initBLEManager();
    return () => {
      if (bleManager) {
        bleManager.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const checkBluetoothState = async () => {
      try {
        await requestBluetoothPermission();
        const bluetoothState = await BluetoothStateManager.getState();

        switch (bluetoothState) {
          case 'Unknown':
          case 'Resetting':
          case 'Unsupported':
          case 'Unauthorized':
            console.log('Bluetooth is not available:', bluetoothState);
            break;
          case 'PoweredOff':
            console.log('Bluetooth is powered off:', bluetoothState);
            BluetoothStateManager.enable().then(result => {
              console.log(result);
            });

            break;
          case 'PoweredOn':
            console.log('Bluetooth is powered on:', bluetoothState);
            break;
          default:
            console.log('Unknown Bluetooth state:', bluetoothState);
            break;
        }
      } catch (error) {
        console.error('Error checking Bluetooth state:', error);
      }

      BluetoothStateManager.addEventListener(
        BluetoothStateManager.EVENT_BLUETOOTH_STATE_CHANGE,
        bluetoothState => {
          console.log(bluetoothState);
          if (bluetoothState == 'PoweredOff') {
            BluetoothStateManager.enable().then(result => {
              console.log(result);
            });
          }
        },
      );
    };

    checkBluetoothState();
  }, []);

  const initBLEManager = async () => {
    const manager = new BleManager();
    setBleManager(manager);
  };

  const requestBluetoothPermission = async () => {
    if (Platform.OS === 'ios') {
      return true;
    }
    if (
      Platform.OS === 'android' &&
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    ) {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN &&
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          result['android.permission.BLUETOOTH_CONNECT'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.BLUETOOTH_SCAN'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result['android.permission.ACCESS_FINE_LOCATION'] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }

    this.showErrorToast('Permission have not been granted');

    return false;
  };

  const scanAndConnect = async () => {
    if (!bleManager) {
      console.error('BleManager not initialized');
      return;
    }

    try {
      const permissionGranted = await requestBluetoothPermission();
      if (!permissionGranted) {
        console.error('Bluetooth permissions not granted');
        return;
      }

      console.log('Scanning for BLE devices...');
      const scanning = await bleManager.startDeviceScan(
        null,
        null,
        (error, device) => {
          if (error) {
            console.error('Scan error:', error);
            //scanAndConnect();
            return;
          }

          console.log('Found BLE device:', device.name, device.id);

          if (device.name === 'ESP32-CAM') {
            console.log('Connecting to device...');
            bleManager.stopDeviceScan();
            connectToDevice(device);
          }
        },
      );

      console.log('Scanning:', scanning);
    } catch (error) {
      console.error('Error scanning for BLE devices:', error);
    }
  };

  const [isConnected, setIsConnected] = useState(false);

  const [data, setData] = useState();

  const connectToDevice = async device => {
    try {
      const connectedDevice = await device.connect();
      console.log('Connected to device:', connectedDevice.name);

      console.log('Is device connected:', connectedDevice.id);

      console.log('Discovering services and characteristics...');

      setIsConnected(true);

      // await device.discoverAllServicesAndCharacteristics();
      // const servicesa = await device.services();
      // servicesa.forEach(async service => {
      //   const characteristics = await device.characteristicsForService(
      //     service.uuid,
      //   );
      //   characteristics.forEach(console.log);
      // });

      const services =
        await connectedDevice.discoverAllServicesAndCharacteristics();

      const service1 = await device.services();
      let mergedArray = [];

      console.log(service1);
      for (const service of service1) {
        const characteristics = await device.characteristicsForService(
          service.uuid,
        );
        for (const characteristic of characteristics) {
          characteristic.monitor((error, update) => {
            if (error) {
              console.error(`Characteristic monitor error: ${error}`);
              return;
            }
            const decodedData = atob(update.value);
            const newData = JSON.parse(decodedData);

            setData(prevData => {
              const updatedData = {...prevData};

              for (const key in newData) {
                if (newData.hasOwnProperty(key)) {
                  updatedData[key] = newData[key];
                }
              }

              return updatedData;
            });
          });
        }
      }

      console.log('Services and characteristics:', services);

      console.log('Reading characteristic value...');
      const characteristic = await connectedDevice.readCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
      );

      // const data = readCharacteristic(characteristic, connectedDevice);
      // console.log('-----------data', data);
      // setData(data);
    } catch (error) {
      console.error('Error connecting to device:', error);
    }
  };

  useEffect(() => {
    console.log('ff', data);
  }, [data]);

  const readCharacteristic = (characteristic, connectedDevice) => {
    if (characteristic) {
      characteristic.monitor((error, update) => {
        if (error) {
          console.error(`Characteristic monitor error: ${error}`);

          BluetoothStateManager.addEventListener(
            BluetoothStateManager.EVENT_BLUETOOTH_STATE_CHANGE,
            bluetoothState => {
              console.log(bluetoothState);
              if (bluetoothState == 'PoweredOn') {
                scanAndConnect();
              }
            },
          );

          // setTimeout(async () => {
          //   await scanAndConnect();
          // }, 3000);

          return;
        }

        //console.log('Is Characteristics Readable:', update.isReadable);
        //console.log('Heart Rate Data (Base64):', update.value);

        const decodedData = atob(update.value);
        console.log(decodedData);
        return decodedData;
      });

      // Check for disconnection
      connectedDevice.onDisconnected((error, disconnectedDevice) => {
        if (error) {
          console.error(`Disconnection error: ${error}`);
          return;
        }

        console.log('Device disconnected:', disconnectedDevice.name);
        scanAndConnect();
      });
    }
  };
  // const disconnectFromDevice = async deviceId => {
  //   try {
  //     await bleManager.cancelDeviceConnection(deviceId);
  //     console.log('Disconnected from device:', deviceId);
  //     // Update connection status
  //     setIsConnected(false);
  //   } catch (error) {
  //     console.error('Error disconnecting from device:', error);
  //   }
  // };

  return (
    <SafeAreaView
      style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <TouchableOpacity
        onPress={scanAndConnect}
        style={{padding: 20, backgroundColor: 'blue', borderRadius: 5}}>
        <Text style={{color: '#fff'}}>Start Scanning</Text>
      </TouchableOpacity>

      <View>
        {data &&
          Object.keys(data).map(key => (
            <Text key={key}>{`${key}: ${data[key]}`}</Text>
          ))}
      </View>
    </SafeAreaView>
  );
};

export default App;
