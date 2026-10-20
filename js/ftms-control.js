// Bluetooth write completion isn't an FTMS acknowledgement. Wait for indication 0x80.
export class FTMSControl {
  constructor(characteristic, timeout = 5000) {
    this.characteristic = characteristic;
    this.timeout = timeout;
    this.tail = Promise.resolve();
    this.generation = 0;
    this.pending = null;
    this.failed = false;
    this.handleResponse = this.handleResponse.bind(this);
    characteristic.addEventListener(
      "characteristicvaluechanged",
      this.handleResponse,
    );
  }
  handleResponse(event) {
    const value = event.target.value;
    if (
      !this.pending ||
      value.byteLength < 3 ||
      value.getUint8(0) !== 0x80 ||
      value.getUint8(1) !== this.pending.opcode
    )
      return;
    const pending = this.pending;
    const result = value.getUint8(2);
    if (result === 1) pending.resolve();
    else
      pending.reject(
        new Error(
          {
            2: "Treadmill does not support this command.",
            3: "Treadmill rejected the target.",
            4: "Treadmill could not complete the command.",
            5: "Treadmill control was lost. Close other training apps and reconnect.",
          }[result] ?? `Treadmill error ${result}.`,
        ),
      );
  }
  send(bytes) {
    const generation = this.generation;
    const task = this.tail.then(() => {
      if (generation !== this.generation) throw new Error("Command cancelled.");
      if (this.failed) throw new Error("Treadmill control needs reconnection.");
      return new Promise((resolve, reject) => {
        const settle = (error) => {
          clearTimeout(timer);
          this.pending = null;
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(() => {
          this.failed = true; // Late indications must not acknowledge a later command.
          settle(
            new Error("Treadmill response timed out. Reconnect the treadmill."),
          );
        }, this.timeout);
        const pending = {
          opcode: bytes[0],
          resolve: () => settle(),
          reject: settle,
        };
        this.pending = pending;
        try {
          const write =
            this.characteristic.writeValueWithResponse ??
            this.characteristic.writeValue;
          Promise.resolve(write.call(this.characteristic, bytes)).catch(
            (error) => {
              if (this.pending === pending) {
                this.failed = true;
                settle(error);
              }
            },
          );
        } catch (error) {
          this.failed = true;
          settle(error);
        }
      });
    });
    this.tail = task.catch(() => {});
    return task;
  }
  cancelQueued() {
    this.generation++;
  }
  dispose() {
    this.cancelQueued();
    this.pending?.reject(new Error("Treadmill disconnected."));
    this.characteristic.removeEventListener(
      "characteristicvaluechanged",
      this.handleResponse,
    );
  }
}
