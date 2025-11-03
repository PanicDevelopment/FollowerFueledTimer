const { execSync } = require('child_process');

function killEdgeProcesses() {
  try {
    console.log("Attempting graceful Edge shutdown...");
    try {
      execSync('taskkill /IM msedge.exe', { encoding: 'utf8' });
      console.log("Graceful shutdown initiated");
      const startTime = Date.now();
      while (Date.now() - startTime < 5000) {
        try {
          execSync('tasklist /FI "IMAGENAME eq msedge.exe"', { encoding: 'utf8' });
        } catch {
          console.log("Edge closed gracefully");
          return true;
        }
      }
      console.log("Graceful close timed out, forcing termination...");
    } catch (err) {
      console.log("Graceful close not available, forcing termination...");
    }
    try {
      execSync('taskkill /F /IM msedge.exe /T', { encoding: 'utf8' });
      console.log("Edge processes terminated forcefully");
      return true;
    } catch (err) {
      console.log("Some processes could not be terminated (may require admin):", err.message);
      return false;
    }
  } catch (error) {
    console.log("Error during Edge shutdown:", error.message);
    return false;
  }
}

module.exports = { killEdgeProcesses };
