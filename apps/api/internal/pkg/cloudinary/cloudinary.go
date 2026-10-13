package cloudinary

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

type Client struct {
	cld       *cloudinary.Cloudinary
	cloudName string
	apiKey    string
	apiSecret string
}

func New(cloudName, apiKey, apiSecret string) (*Client, error) {
	if cloudName == "" || apiKey == "" || apiSecret == "" {
		return nil, fmt.Errorf("cloudinary: missing required credentials")
	}

	cld, err := cloudinary.NewFromParams(cloudName, apiKey, apiSecret)
	if err != nil {
		return nil, err
	}
	return &Client{cld: cld, cloudName: cloudName, apiKey: apiKey, apiSecret: apiSecret}, nil
}

// UploadSignature lets a browser upload straight to Cloudinary: the
// signed parameters (allowed formats, folder and timestamp) plus what the
// upload form needs. The form must send every signed parameter as is.
type UploadSignature struct {
	CloudName      string `json:"cloud_name"`
	APIKey         string `json:"api_key"`
	AllowedFormats string `json:"allowed_formats"`
	Folder         string `json:"folder"`
	Timestamp      int64  `json:"timestamp"`
	Signature      string `json:"signature"`
}

// ProductFormats are the image formats an upload may have. Being signed,
// Cloudinary enforces them, not just the admin's file picker.
const ProductFormats = "jpg,png,webp,avif"

// SignUpload signs an upload into folder at timestamp (Unix seconds);
// Cloudinary rejects it an hour later, or if the file isn't one of
// ProductFormats.
func (c *Client) SignUpload(folder string, timestamp int64) (UploadSignature, error) {
	params := url.Values{}
	params.Set("allowed_formats", ProductFormats)
	params.Set("folder", folder)
	params.Set("timestamp", strconv.FormatInt(timestamp, 10))
	signature, err := api.SignParameters(params, c.apiSecret)
	if err != nil {
		return UploadSignature{}, fmt.Errorf("cloudinary: sign upload: %w", err)
	}
	return UploadSignature{
		CloudName:      c.cloudName,
		APIKey:         c.apiKey,
		AllowedFormats: ProductFormats,
		Folder:         folder,
		Timestamp:      timestamp,
		Signature:      signature,
	}, nil
}

// ProductFolder is where admin uploads land; only images in it are ever
// deleted.
const ProductFolder = "ohhobastra/products"

// Owns reports whether an image is one of our product uploads: hosted on
// this cloud, in ProductFolder, under the public id it was stored with. Only
// those may be deleted. Other clouds' public ids (the demo catalog's
// "samples/...") could name this cloud's own assets, and the public id
// arrives separately from the URL, so it has to match it.
func (c *Client) Owns(imageURL, publicID string) bool {
	return strings.HasPrefix(imageURL, "https://res.cloudinary.com/"+c.cloudName+"/image/upload/") &&
		strings.HasPrefix(publicID, ProductFolder+"/") &&
		strings.Contains(imageURL, "/"+publicID+".")
}

func (c *Client) UploadImage(ctx context.Context, file interface{}, folder string) (string, string, error) {
	resp, err := c.cld.Upload.Upload(ctx, file, uploader.UploadParams{
		Folder:       folder,
		ResourceType: "image",
	})
	if err != nil {
		return "", "", err
	}
	return resp.SecureURL, resp.PublicID, nil
}

func (c *Client) DeleteImage(ctx context.Context, publicID string) error {
	_, err := c.cld.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID: publicID,
	})
	return err
}
