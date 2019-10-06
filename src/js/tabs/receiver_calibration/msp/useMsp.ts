import {useEffect, useState} from "react";

export default function useMsp(key: string) {
    useEffect(() => {
        window.addEventListener("message", handleDataUpdate, false);

        return () => window.removeEventListener("message", handleDataUpdate, false);
    });

    const [data, setData] = useState();

    const handleDataUpdate = ({data}: {data: any}) => {
        // TODO Process data
        // Check for presence of key
        setData(data);
    };

    return [data, (data: any) => {
        window.parent.postMessage({
            key,
            data
        }, "*")
    }]
}
