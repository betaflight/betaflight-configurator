import React, {useState} from 'react';
import ChannelDetect from './calibrate/ChannelDetect';
import useMsp from "../msp/useMsp";
import styles from './Calibrate.module.css';
import cx from 'classnames';
import {objectValues} from "../utils";

const CHANNELS = [
  {
    name: 'Throttle',
    code: 'T'
  },
  {
    name: 'Yaw',
    code: 'R'
  },
  {
    name: 'Pitch',
    code: 'E'
  },
  {
    name: 'Roll',
    code: 'A'
  }
];

interface IObjectIndexSignature {
  [code: string]: any
}

interface Props {
  txValues: Array<number>
  onRestart: () => void
  onDone: () => void
}

const Calibrate: React.FunctionComponent<Props> = ({txValues, onRestart, onDone}) => {

  if (txValues === null) {
    return <div>'Loading'</div>
  }

  const [currentChannel, setCurrentChannel] = useState(0);
  const [detectedChannels, setDetectedChannels] = useState({});
  const [initialMins, setMins] = useState(txValues);
  const [initialMaxs, setMaxs] = useState(txValues);
  const [rxRange, setRxRange] = useMsp('rxrange');
  const [rxMap, setRxMap] = useMsp('rxmap');

  function detectedChannelsToChannelMapping(detectedChannels: IObjectIndexSignature) {
    const txToChannels: IObjectIndexSignature = Object.keys(detectedChannels)
      .reduce((prev: IObjectIndexSignature, curr: string) => {
        prev[detectedChannels[curr]] = curr;
        return prev;
      }, {});

    return CHANNELS.map((channel, i) => {
      const ch = txToChannels[i];
      return CHANNELS[ch].code;
    });
  }

  function getRxRange() {
    return minVals.map((v, i) => [v, maxVals[i]]);
  }

  function handleNext() {
    setCurrentChannel(currentChannel + 1);
  }

  function handleDetect(channel: Number) {
    setDetectedChannels({
      ...detectedChannels,
      [currentChannel]: channel
    });
  }

  function handleRestart() {
    onRestart();
  }

  function handleApply() {
    const mapping = detectedChannelsToChannelMapping(detectedChannels);

    setRxMap(`${mapping.join('')}1234`);
    setRxRange(getRxRange());

    onDone();
  }

  const minVals = txValues.map((val, i) => Math.min(initialMins[i], val));
  const maxVals = txValues.map((val, i) => Math.max(initialMaxs[i], val));

  if (!initialMaxs.every((val, i) => val === maxVals[i])) {
    setMaxs(maxVals);
  }

  if (!initialMins.every((val, i) => val === minVals[i])) {
    setMins(minVals);
  }

  return <div className={styles.Calibrate}>
    {currentChannel !== CHANNELS.length && txValues.map((value, i) => {
      const channelIsAssigned = objectValues(detectedChannels).indexOf(i);
      return (
        <div key={i} className={styles.txChannelWrapper}>
          <div className={styles.txChannel}>
            <div className={styles.matchedChannel}>
              {channelIsAssigned > -1 && ` ✔ ${CHANNELS[channelIsAssigned].name}`}
            </div>
            <div className={styles.meter}>
              <div
                className={cx(
                  styles.fill,
                  `fill${i}`
                )}
                style={{
                  left: `${((minVals[i] - 1000) / 10)}%`,
                  right: `${((2000 - maxVals[i]) / 10)}%`
                }}>
              </div>
              <div className={styles.label}>{value}</div>
            </div>
          </div>
        </div>
      )
    })}

    <div className={styles.ChannelDetect}>
      {CHANNELS.map(({name}, i) => {
        return currentChannel === i &&
          <ChannelDetect name={name}
                         txValues={txValues}
                         detectedChannels={detectedChannels}
                         onDetect={handleDetect}
                         key={name} />
      })}


      {currentChannel !== CHANNELS.length &&
      <button onClick={handleRestart} className={cx(
        styles.restartButton,
        "button",
        "button-outline"
        )}>Restart</button>}

      {currentChannel < CHANNELS.length &&
      <button onClick={handleNext} disabled={currentChannel === Object.keys(detectedChannels).length} className={cx(
        styles.nextButton,
        'button'
      )}>
        Next
      </button>}
    </div>

    {currentChannel === CHANNELS.length &&
      <div>
        <div>
          <p>The following settings are ready to be applied:</p>
          <ul>
            <li>rxrange:
              <ul>
                {getRxRange().map(([min, max]) => <li>{`${min} - ${max}`}</li>)}
              </ul>
            </li>
            <li>Channel mapping: {detectedChannelsToChannelMapping(detectedChannels)}</li>
          </ul>
        </div>
        <button onClick={handleRestart} className={cx(
          styles.restartButton,
          "button",
          "button-outline"
        )}>Restart</button>

        <button onClick={handleApply} className="button">Apply settings</button>
      </div>
    }
  </div>
};

export default Calibrate;
