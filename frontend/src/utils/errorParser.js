export function errorParse(error) {
    let errorMessage = error.detail;
    
    if (Array.isArray(errorMessage)) {
        errorMessage = errorMessage
            .map(err => {
                const cleanMsg = err.msg.replace("Value error, ", "");
                return `Pole "${err.loc[err.loc.length - 1]}": ${cleanMsg}`;
            }).join('\n');
        } else if (typeof errorMessage === 'string') {
            const lowerError = errorMessage.toLowerCase();
            if (lowerError.includes("already in use")) {
                errorMessage = "This IP address is already assigned to another interface. Please use a unique address.";
            } else if (lowerError.includes("does not exist")) {
                errorMessage = "Port does not exist.";
            }
        } else if (errorMessage && typeof errorMessage === 'object') {
            errorMessage = JSON.stringify(errorMessage);
        } else {
            errorMessage = "Error connecting to server.";
        }

    return errorMessage;
}