import React, { useState, useEffect } from 'react';
import { fetchData } from './api';

const API_URL = 'https://example.com';

export function MyComponent({ id }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData(id).then(setData);
  }, [id]);

  return <div>{data}</div>;
}

const helper = (x) => x * 2;

export default MyComponent;
