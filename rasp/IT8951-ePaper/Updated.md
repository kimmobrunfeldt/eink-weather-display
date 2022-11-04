## 1 程序说明

### 1.1 更新日志

* 1.采用4bpp刷新16级灰度图像，SPI传输数据量减小为原来的一半，避免了上一版本采用8bpp来刷新16级灰度图像造成的RAM及传输时间的浪费

* 2.SPI传输速度提高一倍，在树莓派3代中有效，树莓派4代由于CPU主频的提高而无效

* 3.刷新图片的时间间隔减小为原来的1/4，实测上一版本程序采用GC16模式全屏刷新一张16级灰度的bmp图片到10.3inch e-Paper (D)中需要10S左右，而本例程只需要3S左右

* 4.避免了上一版本打开bmp文件后分配缓存但并未释放造成的内存泄露

* 5.添加1bpp，2bpp，4bpp，8bpp模式支持

* 6.添加A2模式刷新例程，可直观感受A2模式刷新速度

* 7.添加画点，画线，画圆，画矩形，写字符等支持，支持绘制字符及图案的灰度选择，支持1bpp，2bpp，4bpp，8bpp，若选择1bpp，还支持A2模式刷新

* 8.添加bmp图片的1bpp，2bpp，4bpp，8bpp刷新支持，若选择1bpp，还支持A2模式刷新

* 9.添加显示GIF图片例程，可将多张图片写入到IT8951缓存中，显示时直接将缓存中不同地址的数据刷入到墨水屏中显示即可，免去RPi与IT8951数据传输过程，刷新帧率达7fps

* 10.添加帧率测试例程，方便测试刷新不同大小的区域时，1bpp，2bpp，4bpp，8bpp，以及A2模式，GC16模式，刷新的帧率

* 11.支持增强驱动能力，避免某些情况下，屏幕显示局部模糊

* 12.支持对6inch ePaper HAT 6inch HD ePaper HAT的4字节对齐，避免1bp刷新时显示不正常

* 13.例程运行时需要输入VCOM，例程运行结束将全刷白，以保护屏幕，延长屏幕使用寿命

* 14.优化程序结构，降低程序的耦合性，规范部分函数，变量命名


### 1.2 例程说明

#### 1.2.1 依次局部刷新16条由浅到深的灰阶的灰度条
* 函数名：Display_ColorPalette_Example

* 该Demo演示了，如何采用4bp，结合GC16模式，依次局部刷新16条由浅到深的灰阶的灰度条。

#### 1.2.2 画点，画线，画圆，画矩形，写字符
* 函数名： Display_CharacterPattern_Example

* 该Demo演示了，如何画点，画线，画圆，画矩形，写字符，支持1bpp，2bpp，4bpp，8bpp，如果采用1bpp，则还支持A2模式刷新。


#### 1.2.3 显示BMP图片
* 函数名：Display_BMP_Example

* 该Demo演示了，如何刷新一张bmp图片，支持1bpp，2bpp，4bpp，8bpp，如果采用1bpp，则还支持A2模式刷新。

#### 1.2.4 A2模式刷新示例
* 函数名：Dynamic_Refresh_Example

* 该Demo演示了，如何采用A2模式进行刷新，在本Demo中，将多次刷新，刷新区域将不断变化，且刷新区域的面积也将逐渐变大，在经过多次刷新后，出现残影，将采用INIT模式清除残影。通过本Demo，可直观感受到A2模式的刷新速度。

#### 1.2.5 显示GIF图像
* 函数名：Dynamic_GIF_Example

* 该Demo演示了，如何刷新一张GIF图像，在本Demo中，事先将一张GIF图像拆分成了7张bmp图像，并先将7张bmp图像依次写入到IT8951的一块连续地址的缓存中，显示的时候，将依次从IT8951相应地址的缓存中读取出图像数据刷新到墨水屏中，由于没了RPi与IT8951传输数据的过程，刷新速度将非常快，本Demo也演示了IT8951刷新墨水屏的极限速度，约7fps。

#### 1.2.6 测试帧率
* 函数名：Check_FrameRate_Example

* 该Demo是为了方便测试：刷新不同大小的区域时，1bpp，2bpp，4bpp，8bpp，以及A2模式，GC16模式，刷新的帧率，在本Demo中，将自动统计刷新10帧图像的时间，并自动计算帧率(fps)。



### 1.3 相关说明
#### 1.3.1 模式说明

IT8951针对不同分辨率的屏幕刷入了不同的固件，不同的固件有不同的刷新模式，详情见[模式说明](http://www.waveshare.net/wiki/File:E-paper-mode-declaration.pdf)，在例程中用到的模式有：INIT模式，GC16模式，A2模式

下面对相关模式进行简要说明：

| 模式 | 特点                                                         | 6inch/6inch HD | 7.8inch/9.7inch/10.3inch |
| ---- | ------------------------------------------------------------ | -------------- | ------------------------ |
| INIT | 用于擦除显示内容，清屏，多次A2模式刷新后建议采用INIT模式清屏 | Mode0          | Mode0                    |
| GC16 | 采用16级灰度更新屏幕显示内容，显示效果最好                   | Mode2          | Mode2                    |
| A2   | 只能更新黑白2级灰度，但刷新速度最快                          | Mode4          | Mode6                    |


```c
//basic mode definition
UBYTE INIT_Mode = 0;
UBYTE GC16_Mode = 2;
//A2_Mode's value is not fixed, is decide by firmware's LUT 
UBYTE A2_Mode = 6;
```

```c

if( strcmp(LUT_Version, "M641") == 0 ){
    //6inch e-Paper HAT(800,600), 6inch HD e-Paper HAT(1448,1072), 6inch HD touch e-Paper HAT(1448,1072)
    A2_Mode = 4;
    Four_Byte_Align = true;
}else if( strcmp(LUT_Version, "M841") == 0 ){
    //9.7inch e-Paper HAT(1200,825)
    A2_Mode = 6;
}else if( strcmp(LUT_Version, "M841_TFA2812") == 0 ){
    //7.8inch e-Paper HAT(1872,1404)
    A2_Mode = 6;
}else if( strcmp(LUT_Version, "M841_TFA5210") == 0 ){
    //10.3inch e-Paper HAT(1872,1404)
    A2_Mode = 6;
}else{
    //default set to 6 as A2 Mode
    A2_Mode = 6;
}

```

#### 1.3.2 bpp说明

bpp(Bits Per Pixel)，表示的是一个像素点所占用的bit数，目前，所有屏幕支持1bpp，2bpp，4bpp，8bpp模式刷新。

* 1bpp
>* 每个像素占用1bit
>* 能显示2(2^1=2)级灰度，适用于A2模式(只能更新黑白2级灰度)
>* 每个字节可存储8个像素点
>* 像素点在RAM中的1个字节中采用大端序存储：
>  ![](http://huangruimin.club//20191219165020.png)
>* 在IT8951中默认采用小端序，需要将大端序转换成小端序

* 2bpp
>* 每个像素占用2bit
>* 能显示4(2^2=4)级灰度
>* 每个字节可存储4个像素点
>* 像素点在RAM中的每1个字节中采用大端序存储：
>  ![](http://huangruimin.club//20191219164855.png)
>* 在IT8951中默认采用小端序，需要将大端序转换成小端序

* 4bpp
>* 每个像素占用4bit
>* 能显示16(2^4=16)级灰度
>* 每个字节可存储2个像素点
>* 像素点在RAM中的每1个字节中采用大端序存储：
>  ![](http://huangruimin.club//20191219164916.png)
>* 在IT8951中默认采用小端序，需要将大端序转换成小端序
>* **建议采用4bpp进行刷新，可显示16级灰度，且相对8bpp，传输数据量减小一半，传输速度快一倍，显示效果无差别。**

* 8bpp
>* 每个像素占用8bit
>* 能显示256(2^8=256)级灰度，但在IT8951中只取高4位，因此只能显示16级灰度
>* 每个字节可存储1个像素点
>* 像素点在RAM中的每1个字节中采用大端序存储：
>  ![](http://huangruimin.club//20191219164949.png)
>* 在IT8951中默认采用小端序，需要将大端序转换成小端序

* 由原始图像获取相应的灰阶图像
  在程序中，具体的操作是：无论是画点，画线，还是获取图像，得到的每一个像素点都是1个字节(8 bits)的，若要获取相应的灰阶，只需要取得该字节的相应的高位bit即可，例如：需要获取2bpp的像素点，只需要从8bpp(8 bits)的像素点中获取高2位即可。具体操作如下程序所示，在该程序中，还将RAM中每一个字节从大端序转换成了小端序。
```c
UDOUBLE Addr = X * (Paint.BitsPerPixel) / 8 + Y * Paint.WidthByte;
switch( Paint.BitsPerPixel ){
    case 8:{
        Paint.Image[Addr] = Color & 0xF0;
        break;
    }
    case 4:{
        Paint.Image[Addr] &= ~( (0xF0) >> (7 - (X*4+3)%8 ) );
        Paint.Image[Addr] |= (Color & 0xF0) >> (7 - (X*4+3)%8 );
        break;
    }
    case 2:{
        Paint.Image[Addr] &= ~( (0xC0) >> (7 - (X*2+1)%8 ) );
        Paint.Image[Addr] |= (Color & 0xC0) >> (7 - (X*2+1)%8 );
        break;
    }
    case 1:{
        Paint.Image[Addr] &= ~( (0x80) >> (7 - X%8) );
        Paint.Image[Addr] |= (Color & 0x80) >> (7 - X%8);
        break;
    }
}
```


#### 1.3.3 4字节对齐说明

实际测试中发现：对于6inch e-Paper HAT, 6inch HD e-Paper HAT, 6inch HD touch e-Paper HAT这3款产品，在使用1bpp模式刷新时，需要将刷新区域的起点X，刷新宽度W，进行4字节(32bit)对齐，否则，刷新区域图像将显示异常，具体操作如下面程序所示：

```c
if( strcmp(LUT_Version, "M641") == 0 ){
    //6inch e-Paper HAT(800,600), 6inch HD e-Paper HAT(1448,1072), 6inch HD touch e-Paper HAT(1448,1072)
    A2_Mode = 4;
    Four_Byte_Align = true;
}else if( strcmp(LUT_Version, "M841") == 0 ){
...
}
```

```c
if(Four_Byte_Align == true){
    In_4bp_Refresh_Area_Width = Panel_Width - (Panel_Width % 32);
}else{
    In_4bp_Refresh_Area_Width = Panel_Width;
}
```

```c
X_Start = Min_X < 32 ? 0 : Min_X - (Min_X % 32);
Debug("X_Start:%d\r\n",X_Start);
X_End = ( Max_X + (32 - (Max_X % 32)) ) > Touch_Pannel_Area_Width ? ( Max_X - (Max_X % 32) )  : ( Max_X + (32 - (Max_X % 32)) );
Debug("X_End:%d\r\n",X_End);
Y_Start = Min_Y;
Debug("Y_Start:%d\r\n",Y_Start);
Y_End = Max_Y;
Debug("Y_Start:%d\r\n",Y_End);
Width = X_End - X_Start;
if(Width<=0){
    Width = 32;
}
Debug("Width:%d\r\n",Width);
Height = Y_End-Y_Start;
if(Height<=0){
    Height = 32;
}
Debug("Height:%d\r\n",Height);
```

#### 1.3.4 SPI传输速度说明
* 由于树莓派3和树莓派4的CPU主频的差异：

>* 树莓派3采用16分频时依然可以正常传输，最快也只能采用16分频。


>* 而树莓派4B采用16分频时，SPI速率过高，将出现传输错误，因此树莓派4B的SPI最快只能采用32分频。


* BCM2835库手册中，不同树莓派版本，不同时钟分频，对应的频率说明如下图所示：
  ![](http://huangruimin.club//20191219173204.png)


* 如果需要获得最适合的SPI传输速度，需要根据您的树莓派版本，选择不同的SPI时钟分频，如以下程序及其注释所示：

```c
bcm2835_spi_begin();//Start spi interface, set spi pin for the reuse function
bcm2835_spi_setBitOrder(BCM2835_SPI_BIT_ORDER_MSBFIRST);//High first transmission
bcm2835_spi_setDataMode(BCM2835_SPI_MODE0);//spi mode 0

//bcm2835_spi_setClockDivider(BCM2835_SPI_CLOCK_DIVIDER_16);//For RPi 3/3B/3B+
bcm2835_spi_setClockDivider(BCM2835_SPI_CLOCK_DIVIDER_32);//For RPi 4B

/* SPI clock reference link：*/
/*http://www.airspayce.com/mikem/bcm2835/group__constants.html#gaf2e0ca069b8caef24602a02e8a00884e*/
```


#### 1.3.5 增强驱动能力说明

某些情况下，由于FPC线过长等原因，会导致墨水屏显示局部模糊，此时，尝试增强驱动能力，可有效解决屏幕显示模糊的问题。

具体你程序如下图所示：

```c
#if(Enhance)
    Debug("Attention! Enhanced driving ability, only used when the screen is blurred\r\n");
    Enhance_Driving_Capability();
#endif
```

```c

/******************************************************************************
function :  Enhanced driving capability
parameter:  Enhanced driving capability for IT8951, in case the blurred display effect
******************************************************************************/
void Enhance_Driving_Capability(void)
{
    UWORD RegValue = EPD_IT8951_ReadReg(0x0038);
    Debug("The reg value before writing is %x\r\n", RegValue);
    EPD_IT8951_WriteReg(0x0038, 0x0602);
    RegValue = EPD_IT8951_ReadReg(0x0038);
    Debug("The reg value after writing is %x\r\n", RegValue);
}
```

#### 1.3.6 使用正确的VCOM值

每一块墨水屏的VCOM值均有一定的差异，每一块墨水屏的VCOM值在FPC排线上有标注，在每一次执行程序时，确保使用了正确的VCOM值，否则，长期使墨水屏工作在错误的VCOM值下，显示效果将变差。