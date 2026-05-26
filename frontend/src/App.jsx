import { useState } from 'react';
import AddItemForm from "./devices/AddItemForm.jsx";
import NetworkCanvas from "./devices/NetworkCanvas.jsx";

function App() {
  const [devices, setDevices] = useState([]);

  const handleAddDevice = (newDevice, type) => {
    setDevices(prev => [
      ...prev,
      {
        ...newDevice,
        type: type,
        x: 100,
        y: 100,
      }
    ]);
  };

  const handleUpdateDevicePosition = (id, x, y) => {
    setDevices(prev =>
      prev.map(d => (d.id === id ? { ...d, x, y } : d))
    );
  };

  const handleUpdateDeviceName = (id, newName) => {
    setDevices(prev =>
      prev.map(d => (d.id === id ? { ...d, name: newName } : d))
    );
  };

  return (
     <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box'}}>
      <h1>Routing Algorithms Simulator</h1>

      {/* Kontenery na formularze */}
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>

        {/* Formularz dla Routera */}
        <AddItemForm
          title="Dodaj nowy router"
          namePlaceholder="Nazwa routera (opcjonalnie)"
          numberPlaceholder="Liczba portów (domyślnie 1)"
          apiEndpoint="/api/routers"
          onAdd={(data) => handleAddDevice(data, 'router')}
        />

        {/* Formularz dla Komputera */}
        <AddItemForm
          title="Dodaj nowy komputer"
          namePlaceholder="Nazwa komputera (opcjonalnie)"
          numberPlaceholder="Liczba portów (domyślnie 1)"
          apiEndpoint="/api/computers"
          onAdd={(data) => handleAddDevice(data, 'computer')}
        />

      </div>

      {/* Jedno wspólne płótno dla wszystkich obiektów */}
      <NetworkCanvas
        devices={devices}
        onUpdateDevicePosition={handleUpdateDevicePosition}
        onUpdateDeviceName={handleUpdateDeviceName}
      />
    </div>
  );
}

export default App;