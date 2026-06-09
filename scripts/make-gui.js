const fs = require('fs');
const path = require('path');

function makeGui(filePath) {
    console.log(`Processing file: ${filePath}`);
    const buffer = fs.readFileSync(filePath);
    
    // Read PE signature offset at 0x3c
    const peOffset = buffer.readInt32LE(0x3c);
    console.log(`PE signature offset: 0x${peOffset.toString(16)}`);
    
    // Validate PE signature "PE\0\0" (0x00004550)
    const signature = buffer.readUInt32LE(peOffset);
    if (signature !== 0x00004550) {
        throw new Error(`Invalid PE signature: 0x${signature.toString(16)}. This does not seem to be a valid PE file.`);
    }
    
    // Subsystem field is at peOffset + 92 in both PE32 and PE32+ Optional Header
    const subsystemOffset = peOffset + 92;
    const currentSubsystem = buffer.readUInt16LE(subsystemOffset);
    console.log(`Current Subsystem: ${currentSubsystem} (${currentSubsystem === 3 ? 'Console' : currentSubsystem === 2 ? 'GUI' : 'Unknown'})`);
    
    if (currentSubsystem === 3) {
        // Change from Console (3) to GUI (2)
        buffer.writeUInt16LE(2, subsystemOffset);
        fs.writeFileSync(filePath, buffer);
        console.log(`Successfully converted ${filePath} to GUI subsystem (runs in background with no terminal window).`);
    } else if (currentSubsystem === 2) {
        console.log(`File is already a GUI subsystem executable.`);
    } else {
        console.log(`Subsystem is neither Console nor GUI. No changes made.`);
    }
}

// If run directly
if (require.main === module) {
    const targetPath = process.argv[2] || path.join(__dirname, '..', 'release', 'EzPrintWork-Helper.exe');
    try {
        makeGui(targetPath);
    } catch (err) {
        console.error('Error modifying PE subsystem:', err.message);
        process.exit(1);
    }
}

module.exports = makeGui;
