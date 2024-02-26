import { useState, useEffect } from "react";
import { useLocalStorage } from "usehooks-ts";

const useLocalStorageSet = (
  key: string,
  initialValue: string[] = []
): [set: Set<string>, add: (item: string) => void] => {
  const [storedValue, setStoredValue] = useLocalStorage<string[]>(
    key,
    initialValue
  );
  const [set, setSet] = useState<Set<string>>(new Set(storedValue));

  useEffect(() => {
    setStoredValue(Array.from(set));
  }, [set, setStoredValue]);

  const add = (item: string) => {
    setSet((prevSet) => new Set(prevSet).add(item));
  };

  return [set, add];
};

export default useLocalStorageSet;
