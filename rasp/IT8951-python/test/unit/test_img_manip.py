
from IT8951.img_manip import make_changes_bw

from PIL import Image

DIMS = (1200, 400)

def draw_gradient(img):
    '''
    Fills the image with a gradient of 16 levels
    of grayscale.
    '''
    for i in range(16):
        color = i*0x10
        box = (
            i*img.width//16,      # xmin
            0,                        # ymin
            (i+1)*img.width//16,  # xmax
            img.height            # ymax
        )
        img.paste(color, box=box)

def main():
    img1 = Image.new('L', DIMS)
    draw_gradient(img1)

    img2 = img1.copy()

    band = Image.new('L', (DIMS[0], DIMS[1]//5))
    draw_gradient(band)
    band = band.transpose(Image.FLIP_LEFT_RIGHT)
    img2.paste(band, (0, (img2.height-band.height)//2))

    display = Image.new('L', (DIMS[0], DIMS[1]*3))
    display.paste(img1, (0, 0))
    display.paste(img2, (0, DIMS[1]))

    make_changes_bw(img1, img2)

    display.paste(img2, (0, 2*DIMS[1]))

    display.show()

if __name__ == '__main__':
    main()
