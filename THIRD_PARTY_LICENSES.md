# Third-Party Open Source Licenses

แอปพลิเคชัน **My dividend** ใช้งานไลบรารีและแพ็กเกจโอเพนซอร์ส (Open Source Software) ดังรายการต่อไปนี้:

---

## สรุปรายการ Direct Dependencies

| ชื่อแพ็กเกจ (Package) | เวอร์ชัน (Version) | ประเภทลิขสิทธิ์ (License) | ผู้พัฒนา / เจ้าของลิขสิทธิ์ |
| :--- | :--- | :--- | :--- |
| `@expo/metro-runtime` | `57.0.15` | MIT | Expo / 650 Industries, Inc. |
| `@expo/vector-icons` | `15.1.1` | MIT | Expo / 650 Industries, Inc. |
| `@react-native-async-storage/async-storage` | `2.2.0` | MIT | React Native Community |
| `@supabase/supabase-js` | `2.116.0` | MIT | Supabase, Inc. |
| `expo` | `57.0.23` | MIT | Expo / 650 Industries, Inc. |
| `expo-document-picker` | `57.0.2` | MIT | Expo / 650 Industries, Inc. |
| `expo-font` | `57.0.4` | MIT | Expo / 650 Industries, Inc. |
| `expo-linear-gradient` | `57.0.2` | MIT | Expo / 650 Industries, Inc. |
| `expo-notifications` | `57.0.19` | MIT | Expo / 650 Industries, Inc. |
| `expo-status-bar` | `57.0.1` | MIT | Expo / 650 Industries, Inc. |
| `papaparse` | `5.7.0` | MIT | Matt Holt and contributors |
| `react` | `19.2.3` | MIT | Meta Platforms, Inc. and affiliates |
| `react-dom` | `19.2.3` | MIT | Meta Platforms, Inc. and affiliates |
| `react-native` | `0.86.3` | MIT | Meta Platforms, Inc. and affiliates |
| `react-native-gifted-charts` | `1.4.78` | MIT | Abhinandan Kushwaha |
| `react-native-safe-area-context` | `5.7.0` | MIT | Janic Duplessis |
| `react-native-svg` | `15.15.4` | MIT | Horcrux and Software Mansion |
| `react-native-web` | `0.21.2` | MIT | Nicolas Gallagher |

### Dev Dependencies (เครื่องมือสำหรับพัฒนา)
| ชื่อแพ็กเกจ (Package) | เวอร์ชัน (Version) | ประเภทลิขสิทธิ์ (License) | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| `@expo/ngrok` | `4.1.3` | BSD-2-Clause | ใช้สำหรับ Tunnel URL ในโหมดทดสอบ ไม่บันเดิลลงแอป |
| `@types/papaparse` | `5.5.2` | MIT | TypeScript Definitions |
| `@types/react` | `19.2.18` | MIT | TypeScript Definitions |
| `typescript` | `6.0.3` | Apache-2.0 | TypeScript Compiler |

---

## ข้อกำหนดและข้อสังเกตเกี่ยวกับ Transitive Dependencies

1. **`node-forge` (v1.4.0)**:
   - สัญญาอนุญาต: Dual-licensed `(BSD-3-Clause OR GPL-2.0)`
   - โครงการนี้เลือกปฏิบัติตาม **BSD-3-Clause** ซึ่งเป็น Permissive License เข้ากันได้กับ MIT และไม่มีผลผูกพัน Copyleft ต่อโค้ดของแอปพลิเคชัน
2. **`lightningcss` (v1.33.0)**:
   - สัญญาอนุญาต: **MPL-2.0** (Mozilla Public License 2.0)
   - ใช้เป็นเครื่องมือแปลงไฟล์ CSS ตอนคอมไพล์ (Build Tool) เท่านั้น ไม่มีการดัดแปลงโค้ดต้นฉบับของตัวไลบรารี

---

## ข้อความประกาศลิขสิทธิ์มาตรฐาน (License Texts)

### 1. The MIT License
```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2. The BSD 2-Clause License
```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 3. The BSD 3-Clause License
```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 4. Apache License, Version 2.0
```text
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
