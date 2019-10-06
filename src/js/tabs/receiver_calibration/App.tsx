import React, {useState} from 'react';
import Calibrator from './Calibrator';

import styles from './App.module.css';

export default () => {
    const [showTx, setShowTx] = useState(false);

    const [txValue, setTxValue] = useState([
        1500,
        1500,
        1500,
        1500
    ]);

    return <div className={styles.App}>
        <header className="App-header">
            <img src="https://raw.githubusercontent.com/wiki/betaflight/betaflight/images/betaflight/bf_logo.png"
                 style={{float: "right", width: "200px", padding: "2px 0 0 0"}} />
            <h1>Calibration</h1>
        </header>
        <Calibrator txValues={txValue} />
    </div>
}
