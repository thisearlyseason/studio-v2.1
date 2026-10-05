import {getStorage} from 'firebase-admin/storage';
import {getAdminStorageBucketName} from '@/lib/firebase-admin';
import type {Storage,StorageOptions} from '@google-cloud/storage';

export function mediaBucket(timeout=5000){
  const name=getAdminStorageBucketName(),source=getStorage().bucket(name).storage;
  // A separate SDK client shares only the initialized credential provider.
  // Deadlines/retry settings must never mutate another feature's SDK client.
  const Client=source.constructor as new(options:StorageOptions)=>Storage;
  const client=new Client({projectId:source.projectId,apiEndpoint:source.apiEndpoint,authClient:source.authClient as unknown as StorageOptions['authClient'],retryOptions:{autoRetry:false}});
  client.interceptors.push({request:options=>({...options,uri:'uri' in options?options.uri:options.url,timeout})});
  return client.bucket(name);
}
