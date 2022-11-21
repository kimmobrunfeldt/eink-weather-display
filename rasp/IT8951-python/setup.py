
from os import environ
from setuptools import setup, Extension

# check python version
from sys import version_info
if version_info[0] != 3:
    raise RuntimeError("This module is written for Python 3.")

# use this option if you want to rebuild the .c file yourself with cython
# enable by setting "USE_CYTHON" environment variable before building
USE_CYTHON = 'USE_CYTHON' in environ

if USE_CYTHON:
    ext = '.pyx'
else:
    ext = '.c'

ext_names = [
    'spi',
    'img_manip',
]

extensions = []
for name in ext_names:
    extensions.append(
        Extension(
            "IT8951.{}".format(name),
            ["IT8951/{}{}".format(name, ext)],
        )
    )

if USE_CYTHON:
    from Cython.Build import cythonize
    extensions = cythonize(extensions)

setup(
    name='IT8951',
    packages=['IT8951'],
    version='0.1.1',
    ext_modules=extensions,
)
