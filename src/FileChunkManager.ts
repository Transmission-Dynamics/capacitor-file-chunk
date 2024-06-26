// Copied from:
// https://github.com/qrclip/capacitor-file-chunk/blob/e7f716891628e8e5bd3d6e60f49a55944659810e/demo/src/file-chunk-manager/file-chunk.manager.ts
// as per instruction on npmjs

import type { Directory } from '@capacitor/filesystem';
import { Filesystem } from '@capacitor/filesystem';
import {
  base64_variants,
  crypto_aead_chacha20poly1305_ietf_decrypt,
  crypto_aead_chacha20poly1305_ietf_encrypt,
  crypto_aead_chacha20poly1305_ietf_keygen,
  crypto_aead_chacha20poly1305_IETF_NPUBBYTES,
  ready as isSodiumReady,
  randombytes_buf,
  to_base64,
} from 'libsodium-wrappers';
import { base64ToString } from 'uint8array-extras';

import type { FileChunkServerInfo } from './index';
import { FileChunk } from './index';

export interface FileChunkManagerStartConfig {
  encryption: boolean;
  port?: number;
  portMin?: number;
  portMax?: number;
  retries?: number;
  chunkSize?: number;
}

export class FileChunkManager {
  mFileChunkServerInfo: FileChunkServerInfo | null = null;
  mEncryptionKey: Uint8Array | null = null;
  mEncryption = false;
  mFilesystem = Filesystem; // TO BE EASIER TO TEST AND MOCK
  mFileChunk = FileChunk; // TO BE EASIER TO TEST AND MOCK

  /////////////////////////////////////////////////////////
  // CONSTRUCTOR
  constructor() {
    this.resetVariables();
  }

  /////////////////////////////////////////////////////////
  // START SERVER
  public async startServer(
    tConfig: FileChunkManagerStartConfig,
  ): Promise<FileChunkServerInfo> {
    // INIT ENCRYPTION
    const tEncryptionBase64Key = await this.initEncryption(tConfig.encryption);

    // START THE SERVER
    this.mFileChunkServerInfo = await this.mFileChunk.startServer({
      encryption: this.mEncryption,
      key: tEncryptionBase64Key,
      port: tConfig.port,
      portMin: tConfig.portMin,
      portMax: tConfig.portMax,
      retries: tConfig.retries,
      chunkSize: tConfig.chunkSize,
    });

    // RETURN THE SERVER INFO
    return this.getFileChunkServerInfo();
  }

  /////////////////////////////////////////////////////////
  // STOP SERVER
  public async stopServer(): Promise<void> {
    await this.mFileChunk.stopServer();
    this.resetVariables();
  }

  /////////////////////////////////////////////////////////
  // GET FILE CHUNK SERVER INFO
  public getFileChunkServerInfo(): FileChunkServerInfo {
    if (!this.mFileChunkServerInfo) {
      return this.getErrorServerInfo();
    } else {
      return this.deepCopyFileChunkServerInfo(this.mFileChunkServerInfo);
    }
  }

  /////////////////////////////////////////////////////////
  // GET CHUNK SIZE
  public getChunkSize(): number {
    if (!this.mFileChunkServerInfo) {
      return 0;
    }
    return this.mFileChunkServerInfo.chunkSize;
  }

  /////////////////////////////////////////////////////////
  // CHECK FILE SIZE
  public async checkFileSize(tPath: string): Promise<number> {
    if (!tPath.startsWith('file://')) {
      tPath = 'file://' + tPath;
    }
    const tStat = await this.mFilesystem.stat({
      path: tPath,
    });
    if (tStat) {
      return tStat.size;
    }
    return -1;
  }

  /////////////////////////////////////////////////////////
  // GET PATH
  public async getPath(tPath: string, tDirectory: Directory): Promise<string> {
    try {
      // CREATE EMPTY FILE
      const tResult = await this.mFilesystem.getUri({
        path: tPath,
        directory: tDirectory,
      });
      if (tResult.uri) {
        return tResult.uri.replace('file://', '');
      } else {
        return '';
      }
    } catch (e) {
      return '';
    }
  }

  /////////////////////////////////////////////////////////
  // CREATE EMPTY FILE
  public async createEmptyFile(
    tPath: string,
    tDirectory: Directory,
  ): Promise<string> {
    try {
      // CREATE EMPTY FILE
      const tResult = await this.mFilesystem.writeFile({
        path: tPath,
        data: '',
        directory: tDirectory,
        recursive: true, // https://www.reddit.com/r/ionic/comments/12032s3/comment/jfbl53e/?utm_source=share&utm_medium=web2x&context=3
      });

      if (tResult) {
        // REMOVE THE 'FILE://' AND APPEND TO BASE URL
        return tResult.uri.replace('file://', '');
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  /////////////////////////////////////////////////////////
  // APPEND CHUNK TO FILE
  public async appendChunkToFile(
    tPath: string,
    tArray: Uint8Array,
  ): Promise<boolean> {
    try {
      if (this.mEncryption) {
        tArray = await this.encryptBuffer(tArray);
      }
      const tResponse = await fetch(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.mFileChunkServerInfo!.baseUrl + tPath,
        {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          headers: { authorization: this.mFileChunkServerInfo!.authToken },
          method: 'put',
          body: new Blob([tArray]),
        },
      );
      return tResponse.status === 204;
    } catch (e) {
      return false;
    }
  }

  /////////////////////////////////////////////////////////
  // READ FILE CHUNK ( LIKE FILE SYSTEM )
  public async readFileChunkFS(
    tPath: string,
    tOffset: number,
    tLength: number,
  ): Promise<string | null> {
    const tResp = await FileChunk.readFileChunk({
      path: tPath,
      offset: tOffset,
      length: tLength,
    });
    return base64ToString(tResp.data);
  }
  /////////////////////////////////////////////////////////
  // READ FILE CHUNK
  public async readFileChunk(
    tPath: string,
    tOffset: number,
    tLength: number,
  ): Promise<Uint8Array | null> {
    if (!this.mFileChunkServerInfo) {
      return null;
    }

    try {
      const tResp = await fetch(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.mFileChunkServerInfo!.baseUrl +
          tPath +
          '?o=' +
          tOffset.toString() +
          '&l=' +
          tLength.toString(),
        {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          headers: { authorization: this.mFileChunkServerInfo!.authToken },
          method: 'get',
        },
      );
      // IN CASE THERES A RESPONSE AND THE STATUS CODE IS 200, EVERYTHING ELSE IS ERROR
      if (tResp && tResp.status === 200) {
        // NO ENCRYPTION
        if (!this.mEncryption) {
          return new Uint8Array(await tResp.arrayBuffer());
        } else {
          // WITH ENCRYPTION
          return this.decryptBuffer(new Uint8Array(await tResp.arrayBuffer()));
        }
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  /////////////////////////////////////////////////////////
  // RESET VARIABLES
  private resetVariables(): void {
    this.mFileChunkServerInfo = null;
    this.mEncryptionKey = null;
    this.mEncryption = false;
  }

  /////////////////////////////////////////////////////////
  // INIT ENCRYPTION
  private async initEncryption(tEncryption: boolean): Promise<string> {
    let tBase64Key = '';

    // WITH ENCRYPTION INITIATE SODIUM AND CREATE A RANDOM KEY
    if (tEncryption) {
      await isSodiumReady;
      this.mEncryption = true;
      this.mEncryptionKey = crypto_aead_chacha20poly1305_ietf_keygen();
      tBase64Key = to_base64(this.mEncryptionKey, base64_variants.ORIGINAL);
    } else {
      // NO ENCRYPTION
      this.mEncryption = false;
      this.mEncryptionKey = null;
    }

    return tBase64Key;
  }

  /////////////////////////////////////////////////////////
  // GET ERROR SERVER INFO
  private getErrorServerInfo(): FileChunkServerInfo {
    return {
      version: 0,
      platform: 'error',
      baseUrl: '',
      authToken: '',
      chunkSize: 0,
      encryptionType: 'none',
      ready: false,
    };
  }

  /////////////////////////////////////////////////////////
  // ENCRYPT BUFFER
  private async encryptBuffer(tArray: Uint8Array): Promise<Uint8Array> {
    if (!this.mEncryptionKey) {
      return new Uint8Array(0);
    }

    // GENERATE A RANDOM IV
    const tIV = randombytes_buf(
      crypto_aead_chacha20poly1305_IETF_NPUBBYTES,
      'uint8array',
    );

    // ENCRYPT THE DATA
    const tEncryptedBuffer = crypto_aead_chacha20poly1305_ietf_encrypt(
      tArray,
      null,
      null,
      tIV,
      this.mEncryptionKey,
      'uint8array',
    );

    // PREPEND THE IV TO THE ENCRYPTED DATA AND RETURN IT
    const tFinalArray = new Uint8Array(tIV.length + tEncryptedBuffer.length);
    tFinalArray.set(tIV);
    tFinalArray.set(tEncryptedBuffer, tIV.length);
    return tFinalArray;
  }

  /////////////////////////////////////////////////////////
  // DECRYPT BUFFER
  private async decryptBuffer(tArray: Uint8Array): Promise<Uint8Array> {
    if (!this.mEncryptionKey) {
      return new Uint8Array(0);
    }

    // SEPARATE THE IV FROM THE ( ENCRYPTED DATA + AUTH TAG )
    const tIVLength = 12; // Length of the IV (nonce) for ChaCha20-Poly1305 (12 bytes)
    const tIV = tArray.subarray(0, tIVLength);
    const tEncryptedData = tArray.subarray(tIVLength);

    // RETURN THE DECRYPTED DATA
    return crypto_aead_chacha20poly1305_ietf_decrypt(
      null,
      tEncryptedData,
      null,
      tIV,
      this.mEncryptionKey,
      'uint8array',
    );
  }

  /////////////////////////////////////////////////////////
  // DEEP COPY FileChunkServerInfo
  private deepCopyFileChunkServerInfo(
    tInfo: FileChunkServerInfo,
  ): FileChunkServerInfo {
    // THERE ARE NO COMPLEX OBJECT HERE SO THIS IS ENOUGH
    // IN CASE OF CHANGE, TESTS WILL FAIL COPYING COMPLEX OBJECTS NO WORRIES
    return { ...tInfo };
  }
}
