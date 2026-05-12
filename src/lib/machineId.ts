// A simple function to generate a consistent machine ID for web clients.
// This is not as robust as the Electron version but serves for simulation.
export const getWebMachineId = () => {
    let id = localStorage.getItem('pm_web_machine_id');
    if (!id) {
        id = `WEB-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('pm_web_machine_id', id);
    }
    return id;
};
